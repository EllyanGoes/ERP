export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getEngemanConfig, getCorretivoCodes } from "@/lib/engeman";

export interface OsDetalhe {
  codord: number;
  tipo: string; // TIPMANUT.DESCRICAO
  planejada: boolean; // true = tipo NÃO corretivo (não desconta)
  temDefeito: boolean; // REGSERV.CODDEF preenchido
  contabilizada: boolean; // entra na parada não planejada (regra atual = temDefeito)
  comJanela: boolean; // tem carimbo MAQPAR→MAQFUN; senão usa HOREXEREA (estimado)
  inicio: string | null; // ISO (MAQPAR, fallback DATPRO)
  fim: string | null; // ISO (MAQFUN, fallback DATFEC)
  horas: number; // parada (MAQPAR→MAQFUN ou HOREXEREA)
  statord: string;
  descricao: string;
}

export interface Segmento {
  codord: number;
  tipo: "naoPlanejada" | "planejada";
  inicioPct: number; // 0–100 dentro do mês
  fimPct: number;
  horas: number;
}

export interface DetalheResponse {
  codApl: number;
  ano: number;
  mes: number;
  inicioMes: string;
  fimMes: string;
  os: OsDetalhe[];
  segmentos: Segmento[];
  resumo: {
    paradaNaoPlanejada: number; // soma das contabilizadas (== nº usado no fechamento)
    nFalhas: number; // contagem das contabilizadas
    paradaDemais: number; // soma das NÃO contabilizadas
    nDemais: number;
    semJanela: number; // contabilizadas sem MAQPAR→MAQFUN (estimadas via HOREXEREA)
  };
  source: "db";
}

/** Engeman guarda OBS como RTF — extrai o texto. */
function stripRtf(input: string | null | undefined): string {
  if (!input) return "";
  if (!input.trim().startsWith("{\\rtf")) return input.trim();
  let t = input.replace(/\{\\[^{}]*\}/g, "");
  t = t.replace(/\\[a-zA-Z]+\d*\s?/g, " ");
  t = t.replace(/[{}]/g, "");
  return t.replace(/\s+/g, " ").trim();
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const round2 = (n: number) => parseFloat(n.toFixed(2));

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const codApl = Number(sp.get("codApl"));
  const ano = Number(sp.get("ano"));
  const mes = Number(sp.get("mes"));
  if (
    !Number.isInteger(codApl) || codApl <= 0 ||
    !Number.isInteger(ano) || ano < 2000 ||
    !Number.isInteger(mes) || mes < 1 || mes > 12
  ) {
    return NextResponse.json({ error: "Parâmetros codApl/ano/mes inválidos" }, { status: 400 });
  }

  try {
    const pool = await sql.connect(await getEngemanConfig());
    try {
      const corretivos = new Set(await getCorretivoCodes(pool));

      const result = await pool
        .request()
        .input("codApl", sql.Int, codApl)
        .input("ano", sql.Int, ano)
        .input("mes", sql.Int, mes)
        .query<{
          CODORD: number;
          OBS: string | null;
          DATPRO: Date | null;
          DATFEC: Date | null;
          MAQPAR: Date | null;
          MAQFUN: Date | null;
          HOREXEREA: number | null;
          STATORD: string | null;
          CODTIPMAN: number | null;
          TIPO: string | null;
          TEM_DEFEITO: number;
        }>(`
          SELECT
            o.CODORD,
            o.OBS,
            o.DATPRO,
            o.DATFEC,
            o.MAQPAR,
            o.MAQFUN,
            ISNULL(o.HOREXEREA, 0) AS HOREXEREA,
            ISNULL(o.STATORD, 'A') AS STATORD,
            o.CODTIPMAN,
            ISNULL(RTRIM(t.DESCRICAO), 'Tipo ' + CAST(ISNULL(o.CODTIPMAN, 0) AS VARCHAR)) AS TIPO,
            CASE WHEN EXISTS (SELECT 1 FROM REGSERV r WHERE r.CODORD = o.CODORD AND r.CODDEF IS NOT NULL)
                 THEN 1 ELSE 0 END AS TEM_DEFEITO
          FROM ORDSERV o
          LEFT JOIN TIPMANUT t ON t.CODTIPMAN = o.CODTIPMAN
          WHERE o.CODAPL = @codApl
            AND o.CODFIL NOT IN (0)
            AND YEAR(o.DATPRO) = @ano
            AND MONTH(o.DATPRO) = @mes
          ORDER BY o.MAQPAR, o.DATPRO
        `);

      // Janela do mês (para a timeline em %).
      const inicioMes = new Date(Date.UTC(ano, mes - 1, 1));
      const fimMes = new Date(Date.UTC(ano, mes, 1)); // exclusivo
      const spanMs = fimMes.getTime() - inicioMes.getTime();
      const pct = (d: Date) => {
        const c = Math.min(Math.max(d.getTime(), inicioMes.getTime()), fimMes.getTime());
        return ((c - inicioMes.getTime()) / spanMs) * 100;
      };

      const os: OsDetalhe[] = [];
      const segmentos: Segmento[] = [];

      for (const r of result.recordset) {
        const comJanela = !!(r.MAQPAR && r.MAQFUN);
        const horas = comJanela
          ? Math.abs((r.MAQFUN!.getTime() - r.MAQPAR!.getTime()) / 3600000)
          : (r.HOREXEREA ?? 0);
        const temDefeito = r.TEM_DEFEITO === 1;
        const planejada = r.CODTIPMAN != null ? !corretivos.has(r.CODTIPMAN) : !temDefeito;
        // Desconta = OS de TIPO corretivo (inspeção/preventiva não contam, mesmo com
        // defeito). temDefeito segue exposto só como informação na tabela.
        const contabilizada = !planejada;

        os.push({
          codord: r.CODORD,
          tipo: r.TIPO ?? "—",
          planejada,
          temDefeito,
          contabilizada,
          comJanela,
          inicio: iso(r.MAQPAR ?? r.DATPRO),
          fim: iso(r.MAQFUN ?? r.DATFEC),
          horas: round2(horas),
          statord: r.STATORD ?? "A",
          descricao: stripRtf(r.OBS) || "Sem descrição",
        });

        if (comJanela) {
          segmentos.push({
            codord: r.CODORD,
            tipo: contabilizada ? "naoPlanejada" : "planejada",
            inicioPct: round2(pct(r.MAQPAR!)),
            fimPct: round2(pct(r.MAQFUN!)),
            horas: round2(horas),
          });
        }
      }

      const contab = os.filter((o) => o.contabilizada);
      const demais = os.filter((o) => !o.contabilizada);

      return NextResponse.json({
        codApl,
        ano,
        mes,
        inicioMes: inicioMes.toISOString(),
        fimMes: fimMes.toISOString(),
        os,
        segmentos,
        resumo: {
          paradaNaoPlanejada: round2(contab.reduce((s, o) => s + o.horas, 0)),
          nFalhas: contab.length,
          paradaDemais: round2(demais.reduce((s, o) => s + o.horas, 0)),
          nDemais: demais.length,
          semJanela: contab.filter((o) => !o.comJanela).length,
        },
        source: "db",
      } satisfies DetalheResponse);
    } finally {
      await pool.close();
    }
  } catch (err) {
    console.error(
      "[PCM /api/pcm/ativo-saude/detalhe] Engeman inacessível:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "Engeman inacessível" }, { status: 503 });
  }
}
