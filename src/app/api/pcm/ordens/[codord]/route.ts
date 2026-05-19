export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";

export interface OSDetalhe {
  codord: number;
  titulo: string;         // OBS
  statord: string;        // A / F / C
  statusLabel: string;
  datent: string;         // DATENT (abertura)
  datafim: string | null; // DATAFIM (conclusão)
  maqpar: string | null;  // início parada máquina
  maqfun: string | null;  // retorno máquina
  horexerea: number;      // horas execução
  horasParada: number;    // horas calculadas de parada
  codtipman: number;
  tipo: string;           // TIPMANUT.DESCRICAO
  prioridade: string | null; // Alta / Média / Baixa
  codapl: number | null;
  equipamento: string;    // APLIC.DESCRICAO
  tag: string;
  local: string;          // LOCAPLIC.DESCRICAO
  responsavel: string | null;
  observacoes: string | null;
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
    requestTimeout: 12000,
  },
  pool: { max: 3, min: 0, idleTimeoutMillis: 30000 },
};

function stripRtf(input: string | null | undefined): string {
  if (!input) return "";
  if (!input.trim().startsWith("{\\rtf")) return input.trim();
  let text = input.replace(/\{\\[^{}]*\}/g, "");
  text = text.replace(/\\[a-zA-Z]+\d*\s?/g, " ");
  text = text.replace(/[{}]/g, "");
  return text.replace(/\s+/g, " ").trim() || "Sem descrição";
}

function fmtDatetime(d: Date | string | null): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

const STATUS_LABEL: Record<string, string> = {
  A: "Em Aberto",
  F: "Concluída",
  C: "Cancelada",
  E: "Em Espera",
  P: "Em Progresso",
};

async function queryOS(codord: number): Promise<OSDetalhe | null> {
  const pool = await sql.connect(dbConfig);
  try {
    const result = await pool.request()
      .input("codord", sql.Int, codord)
      .query<{
        CODORD: number;
        OBS: string | null;
        STATORD: string | null;
        DATENT: Date | null;
        MAQPAR: Date | null;
        MAQFUN: Date | null;
        HOREXEREA: number | null;
        CODTIPMAN: number | null;
        TIPO: string | null;
        PRISUB: number | null;
        CODAPL: number | null;
        EQUIPAMENTO: string | null;
        TAG: string | null;
        LOCAL: string | null;
        RESPONSAVEL: string | null;
      }>(`
        SELECT
          o.CODORD,
          o.OBS,
          ISNULL(o.STATORD, 'A')                                    AS STATORD,
          o.DATENT,
          o.MAQPAR,
          o.MAQFUN,
          ISNULL(o.HOREXEREA, 0)                                    AS HOREXEREA,
          o.CODTIPMAN,
          ISNULL(RTRIM(t.DESCRICAO), 'Tipo ' + CAST(ISNULL(o.CODTIPMAN,0) AS VARCHAR)) AS TIPO,
          o.PRISUB,
          o.CODAPL,
          ISNULL(RTRIM(a.DESCRICAO), 'Não informado')               AS EQUIPAMENTO,
          ISNULL(RTRIM(a.TAG), '')                                   AS TAG,
          ISNULL(RTRIM(l.DESCRICAO), 'Não informado')               AS LOCAL,
          NULL                                                      AS RESPONSAVEL
        FROM ORDSERV o
        LEFT JOIN APLIC    a ON a.CODAPL    = o.CODAPL
        LEFT JOIN LOCAPLIC l ON l.CODLOCAPL = a.CODLOCAPL
        LEFT JOIN TIPMANUT t ON t.CODTIPMAN = o.CODTIPMAN
        WHERE o.CODORD = @codord
      `);

    if (result.recordset.length === 0) return null;
    const r = result.recordset[0];

    // Calculate actual machine downtime
    const horasParada =
      r.MAQPAR && r.MAQFUN
        ? Math.abs((r.MAQFUN.getTime() - r.MAQPAR.getTime()) / 3600000)
        : r.HOREXEREA ?? 0;

    const statord = r.STATORD ?? "A";

    return {
      codord:       r.CODORD,
      titulo:       stripRtf(r.OBS) || "Sem descrição",
      statord,
      statusLabel:  STATUS_LABEL[statord] ?? "Em Aberto",
      datent:       fmtDatetime(r.DATENT),
      datafim:      null,
      maqpar:       r.MAQPAR  ? fmtDatetime(r.MAQPAR)  : null,
      maqfun:       r.MAQFUN  ? fmtDatetime(r.MAQFUN)  : null,
      horexerea:    r.HOREXEREA ?? 0,
      horasParada:  parseFloat(horasParada.toFixed(2)),
      codtipman:    r.CODTIPMAN ?? 0,
      tipo:         r.TIPO ?? "—",
      prioridade:
        r.PRISUB === 1 ? "ALTA"
        : r.PRISUB === 2 ? "MÉDIA"
        : r.PRISUB === 3 ? "BAIXA"
        : null,
      codapl:       r.CODAPL,
      equipamento:  r.EQUIPAMENTO ?? "Não informado",
      tag:          r.TAG ?? "",
      local:        r.LOCAL ?? "Não informado",
      responsavel:  r.RESPONSAVEL ?? null,
      observacoes:  null,
    };
  } finally {
    await pool.close();
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { codord: string } }
) {
  const codord = parseInt(params.codord, 10);
  if (isNaN(codord) || codord <= 0) {
    return NextResponse.json({ error: "CODORD inválido" }, { status: 400 });
  }

  try {
    const os = await queryOS(codord);
    if (!os) {
      return NextResponse.json({ error: "OS não encontrada" }, { status: 404 });
    }
    return NextResponse.json({ os, source: "db" });
  } catch (err) {
    console.error("[PCM /api/pcm/ordens/[codord]]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Engeman inacessível" }, { status: 503 });
  }
}
