export const dynamic = "force-dynamic";
import sql from "mssql";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { getEngemanConfig } from "@/lib/engeman";

// ─────────────────────────────────────────────────────────────────────────────
// Execução dos planos de manutenção (Engeman, somente leitura).
//
// "Plano" = PLAMANUT; as O.S. geradas por plano carregam ORDSERV.CODPLA.
// Acompanha, por plano e por mês: O.S. geradas × concluídas, abertas,
// atrasadas (programada no passado e ainda não concluída) e % de execução.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanoResumo {
  codPla: number;
  tag: string;
  descricao: string;
  geradas: number;
  concluidas: number;
  abertas: number;
  canceladas: number;
  atrasadas: number;          // abertas com DATPRO < hoje
  concluidasComAtraso: number; // fechadas depois da data programada
  pctExecucao: number | null; // concluídas / (geradas − canceladas)
  ultimaConclusao: string | null;
  proximaProgramada: string | null;
}

export interface PlanosResponse {
  meses: number;
  totais: {
    planosComOs: number;
    geradas: number;
    concluidas: number;
    abertas: number;
    atrasadas: number;
    pctExecucao: number | null;
  };
  serie: { label: string; geradas: number; concluidas: number }[];
  planos: PlanoResumo[];
  source: "db";
  generatedAt: string;
}

const MESES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const meses = Math.min(Math.max(Number(req.nextUrl.searchParams.get("meses") ?? 12), 1), 36);

  let pool: sql.ConnectionPool | null = null;
  try {
    pool = await sql.connect(await getEngemanConfig());

    // ── Por plano ────────────────────────────────────────────────────────────
    const porPlano = await pool.request()
      .input("meses", sql.Int, meses)
      .query<{
        CODPLA: number; TAG: string | null; DESCRICAO: string | null;
        GERADAS: number; CONCLUIDAS: number; ABERTAS: number; CANCELADAS: number;
        ATRASADAS: number; CONCL_ATRASO: number;
        ULT_CONCLUSAO: Date | null; PROX_PROGRAMADA: Date | null;
      }>(`
        SELECT
          o.CODPLA,
          RTRIM(p.TAG)                                       AS TAG,
          RTRIM(ISNULL(CAST(p.DESCRICAO AS VARCHAR(200)), 'Plano ' + CAST(o.CODPLA AS VARCHAR))) AS DESCRICAO,
          COUNT(*)                                           AS GERADAS,
          SUM(CASE WHEN ISNULL(o.STATORD,'A') = 'F' THEN 1 ELSE 0 END) AS CONCLUIDAS,
          SUM(CASE WHEN ISNULL(o.STATORD,'A') IN ('A','E','P') THEN 1 ELSE 0 END) AS ABERTAS,
          SUM(CASE WHEN ISNULL(o.STATORD,'A') = 'C' THEN 1 ELSE 0 END) AS CANCELADAS,
          SUM(CASE WHEN ISNULL(o.STATORD,'A') IN ('A','E','P') AND o.DATPRO < GETDATE() THEN 1 ELSE 0 END) AS ATRASADAS,
          SUM(CASE WHEN ISNULL(o.STATORD,'A') = 'F' AND o.DATFEC IS NOT NULL AND o.DATPRO IS NOT NULL
                    AND CAST(o.DATFEC AS DATE) > CAST(o.DATPRO AS DATE) THEN 1 ELSE 0 END) AS CONCL_ATRASO,
          MAX(CASE WHEN ISNULL(o.STATORD,'A') = 'F' THEN o.DATFEC END) AS ULT_CONCLUSAO,
          MIN(CASE WHEN ISNULL(o.STATORD,'A') IN ('A','E','P') THEN o.DATPRO END) AS PROX_PROGRAMADA
        FROM ORDSERV o
        LEFT JOIN PLAMANUT p ON p.CODPLA = o.CODPLA
        WHERE o.CODPLA IS NOT NULL
          AND o.DATENT >= DATEADD(MONTH, -@meses, GETDATE())
        GROUP BY o.CODPLA, p.TAG, p.DESCRICAO
        ORDER BY GERADAS DESC
      `);

    // ── Série mensal (geradas × concluídas de O.S. de plano) ────────────────
    const serieResult = await pool.request()
      .input("meses", sql.Int, meses)
      .query<{ ANO: number; MES: number; GERADAS: number; CONCLUIDAS: number }>(`
        SELECT
          YEAR(o.DATENT) AS ANO, MONTH(o.DATENT) AS MES,
          COUNT(*) AS GERADAS,
          SUM(CASE WHEN ISNULL(o.STATORD,'A') = 'F' THEN 1 ELSE 0 END) AS CONCLUIDAS
        FROM ORDSERV o
        WHERE o.CODPLA IS NOT NULL
          AND o.DATENT >= DATEADD(MONTH, -@meses, GETDATE())
        GROUP BY YEAR(o.DATENT), MONTH(o.DATENT)
        ORDER BY ANO, MES
      `);

    const planos: PlanoResumo[] = porPlano.recordset.map((r) => {
      const validas = r.GERADAS - r.CANCELADAS;
      return {
        codPla: r.CODPLA,
        tag: r.TAG ?? String(r.CODPLA),
        descricao: r.DESCRICAO ?? `Plano ${r.CODPLA}`,
        geradas: r.GERADAS,
        concluidas: r.CONCLUIDAS,
        abertas: r.ABERTAS,
        canceladas: r.CANCELADAS,
        atrasadas: r.ATRASADAS,
        concluidasComAtraso: r.CONCL_ATRASO,
        pctExecucao: validas > 0 ? Math.round((r.CONCLUIDAS / validas) * 1000) / 10 : null,
        ultimaConclusao: r.ULT_CONCLUSAO ? r.ULT_CONCLUSAO.toISOString() : null,
        proximaProgramada: r.PROX_PROGRAMADA ? r.PROX_PROGRAMADA.toISOString() : null,
      };
    });

    const soma = (f: (p: PlanoResumo) => number) => planos.reduce((s, p) => s + f(p), 0);
    const geradas = soma((p) => p.geradas);
    const canceladas = soma((p) => p.canceladas);
    const concluidas = soma((p) => p.concluidas);

    const resposta: PlanosResponse = {
      meses,
      totais: {
        planosComOs: planos.length,
        geradas,
        concluidas,
        abertas: soma((p) => p.abertas),
        atrasadas: soma((p) => p.atrasadas),
        pctExecucao: geradas - canceladas > 0 ? Math.round((concluidas / (geradas - canceladas)) * 1000) / 10 : null,
      },
      serie: serieResult.recordset.map((r) => ({
        label: `${MESES_LABEL[r.MES - 1]}/${String(r.ANO).slice(2)}`,
        geradas: r.GERADAS,
        concluidas: r.CONCLUIDAS,
      })),
      planos,
      source: "db",
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(resposta);
  } catch (err) {
    console.error("[pcm/planos]", err);
    return NextResponse.json(
      { error: "Não foi possível consultar o Engeman." },
      { status: 502 }
    );
  } finally {
    await pool?.close().catch(() => {});
  }
}
