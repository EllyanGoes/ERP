export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";

export interface FalhaRegistro {
  codord: number;
  descricao: string;       // OBS
  datent: string;          // data abertura
  datafim: string | null;  // data conclusão
  statord: string;
  horasParada: number;     // tempo de parada calculado
  tipo: string;            // TIPMANUT.DESCRICAO
  prioridade: string | null;
}

export interface FMEAResponse {
  codapl: number;
  equipamento: string;
  tag: string;
  local: string;
  totalFalhas: number;
  totalHorasParada: number;
  mtbf: number;
  mttr: number;
  disponibilidade: number;
  confiabilidade: number;
  periodoMeses: number;
  falhas: FalhaRegistro[];
  source: "db";
  generatedAt: string;
}

const dbConfig: sql.config = {
  server:   process.env.ENGEMAN_HOST ?? "192.168.0.206",
  database: process.env.ENGEMAN_DB   ?? "ENGEMAN_SLAVE",
  user:     process.env.ENGEMAN_USER ?? "sa",
  password: process.env.ENGEMAN_PASS ?? "Tramontin10@",
  port:     Number(process.env.ENGEMAN_PORT ?? 1433),
  options: {
    encrypt: false,
    trustServerCertificate: true,
    connectTimeout: 8000,
    requestTimeout: 20000,
  },
  pool: { max: 3, min: 0, idleTimeoutMillis: 30000 },
};

/** Strip RTF encoding — Engeman stores OBS fields as RTF documents */
function stripRtf(input: string | null | undefined): string {
  if (!input) return "";
  // If it doesn't look like RTF, return as-is
  if (!input.trim().startsWith("{\\rtf")) return input.trim();
  // Remove RTF control groups like {\fonttbl...} {\colortbl...} etc.
  let text = input.replace(/\{\\[^{}]*\}/g, "");
  // Remove remaining RTF control words like \par \pard \fs20 \b \i etc.
  text = text.replace(/\\[a-zA-Z]+\d*\s?/g, " ");
  // Remove remaining braces
  text = text.replace(/[{}]/g, "");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  return text || "Sem descrição";
}

function fmtDatetime(d: Date | string | null): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

async function queryFMEA(codapl: number, dias: number): Promise<FMEAResponse> {
  const pool = await sql.connect(dbConfig);
  const periodoHoras = dias * 24;

  try {
    // ── Detalhes do equipamento + lista de falhas ──────────────────────────
    const result = await pool.request()
      .input("codapl", sql.Int, codapl)
      .input("diasPeriodo", sql.Int, dias)
      .query<{
        CODORD: number;
        OBS: string | null;
        DATENT: Date | null;
        DATAFIM: Date | null;
        MAQPAR: Date | null;
        MAQFUN: Date | null;
        HOREXEREA: number | null;
        STATORD: string | null;
        TIPO: string | null;
        PRISUB: number | null;
        EQUIPAMENTO: string | null;
        TAG: string | null;
        LOCAL: string | null;
      }>(`
        SELECT
          o.CODORD,
          o.OBS,
          o.DATENT,
          NULL                                                      AS DATAFIM,
          o.MAQPAR,
          o.MAQFUN,
          ISNULL(o.HOREXEREA, 0)                                    AS HOREXEREA,
          ISNULL(o.STATORD, 'A')                                    AS STATORD,
          ISNULL(RTRIM(t.DESCRICAO), 'Tipo ' + CAST(ISNULL(o.CODTIPMAN,0) AS VARCHAR)) AS TIPO,
          o.PRISUB,
          ISNULL(RTRIM(a.DESCRICAO), 'Não informado')               AS EQUIPAMENTO,
          CAST(a.CODAPL AS VARCHAR(20))                             AS TAG,
          ISNULL(RTRIM(l.DESCRICAO), 'Não informado')               AS LOCAL
        FROM ORDSERV o
        INNER JOIN APLIC    a ON a.CODAPL    = o.CODAPL
        LEFT  JOIN LOCAPLIC l ON l.CODLOCAPL = a.CODLOCAPL
        LEFT  JOIN TIPMANUT t ON t.CODTIPMAN = o.CODTIPMAN
        WHERE o.CODAPL    = @codapl
          AND o.CODTIPMAN IN (1, 2, 3)
          AND o.DATENT >= DATEADD(DAY, -@diasPeriodo, GETDATE())
        ORDER BY o.DATENT DESC
      `);

    if (result.recordset.length === 0) {
      // Equipamento sem falhas — retorna info básica
      const infoResult = await pool.request()
        .input("codapl2", sql.Int, codapl)
        .query<{ EQUIPAMENTO: string | null; TAG: string | null; LOCAL: string | null }>(`
          SELECT RTRIM(a.DESCRICAO) AS EQUIPAMENTO, CAST(a.CODAPL AS VARCHAR(20)) AS TAG,
                 ISNULL(RTRIM(l.DESCRICAO), 'Não informado') AS LOCAL
          FROM APLIC a
          LEFT JOIN LOCAPLIC l ON l.CODLOCAPL = a.CODLOCAPL
          WHERE a.CODAPL = @codapl2
        `);
      const info = infoResult.recordset[0];
      return {
        codapl,
        equipamento: info?.EQUIPAMENTO ?? "Equipamento não encontrado",
        tag:         info?.TAG ?? "",
        local:       info?.LOCAL ?? "Não informado",
        totalFalhas: 0, totalHorasParada: 0,
        mtbf: periodoHoras, mttr: 0, disponibilidade: 100, confiabilidade: 0,
        periodoMeses: Math.round(dias / 30),
        falhas: [], source: "db", generatedAt: new Date().toISOString(),
      };
    }

    const first = result.recordset[0];
    const equipamento = first.EQUIPAMENTO ?? "Não informado";
    const tag         = first.TAG ?? "";
    const local       = first.LOCAL ?? "Não informado";

    const falhas: FalhaRegistro[] = result.recordset.map((r) => {
      const horasParada = r.MAQPAR && r.MAQFUN
        ? Math.abs((r.MAQFUN.getTime() - r.MAQPAR.getTime()) / 3600000)
        : r.HOREXEREA ?? 0;
      return {
        codord:     r.CODORD,
        descricao:  stripRtf(r.OBS) || "Sem descrição",
        datent:     fmtDatetime(r.DATENT),
        datafim:    r.DATAFIM ? fmtDatetime(r.DATAFIM) : null,
        statord:    r.STATORD ?? "A",
        horasParada: parseFloat(horasParada.toFixed(2)),
        tipo:       r.TIPO ?? "—",
        prioridade:
          r.PRISUB === 1 ? "ALTA"
          : r.PRISUB === 2 ? "MÉDIA"
          : r.PRISUB === 3 ? "BAIXA"
          : null,
      };
    });

    const totalFalhas      = falhas.length;
    const totalHorasParada = falhas.reduce((s, f) => s + f.horasParada, 0);
    const mttr  = totalFalhas > 0 ? totalHorasParada / totalFalhas : 0;
    const mtbf  = totalFalhas > 0 ? Math.max((periodoHoras - totalHorasParada) / totalFalhas, 0) : periodoHoras;
    const disp  = Math.min(Math.max((1 - totalHorasParada / periodoHoras) * 100, 0), 100);
    const conf  = mtbf > 0 ? Math.exp(-720 / mtbf) * 100 : 0;

    return {
      codapl, equipamento, tag, local,
      totalFalhas,
      totalHorasParada: parseFloat(totalHorasParada.toFixed(2)),
      mtbf:             parseFloat(mtbf.toFixed(2)),
      mttr:             parseFloat(mttr.toFixed(2)),
      disponibilidade:  parseFloat(disp.toFixed(2)),
      confiabilidade:   parseFloat(conf.toFixed(2)),
      periodoMeses:     Math.round(dias / 30),
      falhas,
      source: "db",
      generatedAt: new Date().toISOString(),
    };
  } finally {
    await pool.close();
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { codapl: string } }
) {
  const codapl = parseInt(params.codapl, 10);
  if (isNaN(codapl) || codapl <= 0) {
    return NextResponse.json({ error: "CODAPL inválido" }, { status: 400 });
  }
  const dias = parseInt(req.nextUrl.searchParams.get("dias") ?? "365", 10) || 365;

  try {
    const data = await queryFMEA(codapl, dias);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[PCM /api/pcm/fmea]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Engeman inacessível" }, { status: 503 });
  }
}
