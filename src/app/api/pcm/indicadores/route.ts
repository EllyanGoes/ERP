export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getEngemanConfig } from "@/lib/engeman";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface IndicadorEquipamento {
  codApl: number;
  tag: string;
  descricao: string;
  localInstalacao: string;
  totalFalhas: number;
  totalHorasReparo: number;
  mtbf: number;          // horas entre falhas
  mttr: number;          // horas de reparo médio
  disponibilidade: number; // 0–100 %
  confiabilidade: number;  // R(t=720h) = e^(-720/MTBF) × 100
  periodoHoras: number;
}

export interface TendenciaMensal {
  mes: string;           // "YYYY-MM"
  label: string;         // "Jan/25"
  mttrMedio: number;     // h
  mtbfMedio: number;     // h
  disponibilidade: number; // %
  confiabilidade: number;  // R(720h) %
  falhas: number;
  totalHhReparo: number;
}

export interface IndicadoresResponse {
  equipamentos: IndicadorEquipamento[];
  tendencia: TendenciaMensal[];
  locais: string[];
  source: "db";
  generatedAt: string;
}

// ── Engeman SQL Server ────────────────────────────────────────────────────────
// Banco espelho (slave) do Engeman CMMS
// Tabelas reais confirmadas: ORDSERV, APLIC, LOCAPLIC, TIPMANUT
// Tipos corretivos: CODTIPMAN IN (1=CRT, 2=CRP, 3=CRN)
// Status fechada: STATORD = 'F'
// Tempo parada: MAQPAR (início) → MAQFUN (retorno); fallback: HOREXEREA

// ── Queries ───────────────────────────────────────────────────────────────────
async function queryEngeman(diasPeriodo: number): Promise<{
  equipamentos: IndicadorEquipamento[];
  tendencia: TendenciaMensal[];
  locais: string[];
}> {
  const pool = await sql.connect(await getEngemanConfig());
  const periodoHoras = diasPeriodo * 24;

  // ── 1. Indicadores por equipamento ────────────────────────────────────────
  // Fórmula correta (NBR 5462 / referência Tractian/SKF):
  //   Tempo de Disponibilidade = período − horas preventiva
  //   MTBF  = (Disponibilidade − horas corretiva) / nº falhas
  //         = (período − hh_prev − hh_corr) / nº falhas
  //   MTTR  = horas corretiva / nº falhas
  //   Disponibilidade % = (1 − (hh_prev + hh_corr) / período) × 100
  //   Confiabilidade R(24h) = e^(-24/MTBF) × 100  (prob. de operar 24h sem falha)
  //
  // Horas de parada por OS (prioridade):
  //   1. MAQPAR → MAQFUN (tempo real de parada de máquina)
  //   2. HOREXEREA fallback
  const indResult = await pool.request()
    .input("diasPeriodo", sql.Int, diasPeriodo)
    .input("periodoHoras", sql.Float, periodoHoras)
    .query<{
      CODAPL: number;
      TAG: string;
      DESCRICAO: string;
      LOCAL_INSTALACAO: string;
      TOTAL_FALHAS: number;
      TOTAL_HH_REPARO: number;
      MTTR: number;
      MTBF: number;
      DISPONIBILIDADE: number;
    }>(`
      WITH OS AS (
        SELECT
          o.CODAPL,
          o.CODTIPMAN,
          CASE
            WHEN o.MAQPAR IS NOT NULL AND o.MAQFUN IS NOT NULL
              THEN ABS(DATEDIFF(MINUTE, o.MAQPAR, o.MAQFUN)) / 60.0
            ELSE ISNULL(o.HOREXEREA, 0)
          END AS HH
        FROM ORDSERV o
        WHERE o.DATENT >= DATEADD(DAY, -@diasPeriodo, GETDATE())
          AND o.CODAPL IS NOT NULL
          AND o.CODTIPMAN IS NOT NULL
          AND o.STATORD = 'F'
      )
      SELECT
        a.CODAPL,
        CAST(a.CODAPL AS VARCHAR(20))               AS TAG,
        RTRIM(a.DESCRICAO)                          AS DESCRICAO,
        ISNULL(RTRIM(l.DESCRICAO), 'Não informado') AS LOCAL_INSTALACAO,

        /* Falhas = apenas OS corretivas */
        COUNT(CASE WHEN os.CODTIPMAN IN (1,2,3) THEN 1 END) AS TOTAL_FALHAS,

        /* Horas corretivas (para MTTR) */
        SUM(CASE WHEN os.CODTIPMAN IN (1,2,3) THEN os.HH ELSE 0.0 END) AS TOTAL_HH_REPARO,

        /* MTTR = hh_corretivo / falhas */
        SUM(CASE WHEN os.CODTIPMAN IN (1,2,3) THEN os.HH ELSE 0.0 END) /
          NULLIF(COUNT(CASE WHEN os.CODTIPMAN IN (1,2,3) THEN 1 END), 0) AS MTTR,

        /* MTBF = (período − hh_preventiva − hh_corretiva) / falhas */
        (
          @periodoHoras
          - SUM(CASE WHEN os.CODTIPMAN NOT IN (1,2,3) THEN os.HH ELSE 0.0 END)
          - SUM(CASE WHEN os.CODTIPMAN IN (1,2,3)     THEN os.HH ELSE 0.0 END)
        ) / NULLIF(COUNT(CASE WHEN os.CODTIPMAN IN (1,2,3) THEN 1 END), 0) AS MTBF,

        /* Disponibilidade = (1 − (hh_prev + hh_corr) / período) × 100 */
        (1.0 - (
          SUM(CASE WHEN os.CODTIPMAN NOT IN (1,2,3) THEN os.HH ELSE 0.0 END)
          + SUM(CASE WHEN os.CODTIPMAN IN (1,2,3)   THEN os.HH ELSE 0.0 END)
        ) / @periodoHoras) * 100.0 AS DISPONIBILIDADE

      FROM OS os
      INNER JOIN APLIC    a ON a.CODAPL    = os.CODAPL
      LEFT  JOIN LOCAPLIC l ON l.CODLOCAPL = a.CODLOCAPL

      GROUP BY a.CODAPL, a.DESCRICAO, l.DESCRICAO
      HAVING COUNT(CASE WHEN os.CODTIPMAN IN (1,2,3) THEN 1 END) >= 1
      ORDER BY TOTAL_FALHAS DESC
    `);

  // ── 2. Tendência mensal ───────────────────────────────────────────────────
  const trendResult = await pool.request()
    .input("diasPeriodo2", sql.Int, diasPeriodo)
    .query<{
      ANO: number;
      MES: number;
      FALHAS: number;
      MTTR_MEDIO: number;
      TOTAL_HH_REPARO: number;
      HORAS_MES: number;
      MTBF_MEDIO: number;
      DISPONIBILIDADE: number;
    }>(`
      WITH OS2 AS (
        SELECT
          YEAR(o.DATENT)  AS ANO,
          MONTH(o.DATENT) AS MES,
          o.CODTIPMAN,
          CASE
            WHEN o.MAQPAR IS NOT NULL AND o.MAQFUN IS NOT NULL
              THEN ABS(DATEDIFF(MINUTE, o.MAQPAR, o.MAQFUN)) / 60.0
            ELSE ISNULL(o.HOREXEREA, 0)
          END AS HH
        FROM ORDSERV o
        WHERE o.DATENT >= DATEADD(DAY, -@diasPeriodo2, GETDATE())
          AND o.CODTIPMAN IS NOT NULL
          AND o.STATORD = 'F'
      )
      SELECT
        ANO,
        MES,

        /* Falhas = apenas corretivas */
        COUNT(CASE WHEN CODTIPMAN IN (1,2,3) THEN 1 END) AS FALHAS,

        /* MTTR */
        SUM(CASE WHEN CODTIPMAN IN (1,2,3) THEN HH ELSE 0.0 END) /
          NULLIF(COUNT(CASE WHEN CODTIPMAN IN (1,2,3) THEN 1 END), 0) AS MTTR_MEDIO,

        /* Horas corretivas */
        SUM(CASE WHEN CODTIPMAN IN (1,2,3) THEN HH ELSE 0.0 END) AS TOTAL_HH_REPARO,

        /* Horas do mês */
        DAY(EOMONTH(DATEFROMPARTS(ANO, MES, 1))) * 24.0 AS HORAS_MES,

        /* MTBF = (horas_mês − hh_prev − hh_corr) / falhas */
        (
          DAY(EOMONTH(DATEFROMPARTS(ANO, MES, 1))) * 24.0
          - SUM(CASE WHEN CODTIPMAN NOT IN (1,2,3) THEN HH ELSE 0.0 END)
          - SUM(CASE WHEN CODTIPMAN IN (1,2,3)     THEN HH ELSE 0.0 END)
        ) / NULLIF(COUNT(CASE WHEN CODTIPMAN IN (1,2,3) THEN 1 END), 0) AS MTBF_MEDIO,

        /* Disponibilidade = (1 − (hh_prev + hh_corr) / horas_mês) × 100 */
        (1.0 - (
          SUM(CASE WHEN CODTIPMAN NOT IN (1,2,3) THEN HH ELSE 0.0 END)
          + SUM(CASE WHEN CODTIPMAN IN (1,2,3)   THEN HH ELSE 0.0 END)
        ) / (DAY(EOMONTH(DATEFROMPARTS(ANO, MES, 1))) * 24.0)) * 100.0 AS DISPONIBILIDADE

      FROM OS2
      GROUP BY ANO, MES
      HAVING COUNT(CASE WHEN CODTIPMAN IN (1,2,3) THEN 1 END) >= 1
      ORDER BY ANO, MES
    `);

  // ── 3. Locais disponíveis (para filtro) ──────────────────────────────────
  const locaisResult = await pool.request().query<{ DESCRICAO: string }>(`
    SELECT DISTINCT RTRIM(l.DESCRICAO) AS DESCRICAO
    FROM LOCAPLIC l
    WHERE EXISTS (SELECT 1 FROM APLIC a WHERE a.CODLOCAPL = l.CODLOCAPL)
    ORDER BY DESCRICAO
  `);

  await pool.close();

  const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

  const equipamentos: IndicadorEquipamento[] = indResult.recordset.map((r) => {
    const mtbf = Math.max(r.MTBF ?? 0, 0);
    const confiabilidade = mtbf > 0 ? Math.exp(-24 / mtbf) * 100 : 0;
    return {
      codApl:           r.CODAPL,
      tag:              r.TAG ?? "",
      descricao:        r.DESCRICAO ?? "",
      localInstalacao:  r.LOCAL_INSTALACAO ?? "Não informado",
      totalFalhas:      r.TOTAL_FALHAS,
      totalHorasReparo: parseFloat((r.TOTAL_HH_REPARO ?? 0).toFixed(2)),
      mtbf:             parseFloat(mtbf.toFixed(2)),
      mttr:             parseFloat((r.MTTR ?? 0).toFixed(2)),
      disponibilidade:  parseFloat(Math.min(r.DISPONIBILIDADE ?? 100, 100).toFixed(2)),
      confiabilidade:   parseFloat(confiabilidade.toFixed(2)),
      periodoHoras,
    };
  });

  const tendencia: TendenciaMensal[] = trendResult.recordset.map((r) => {
    const mtbf = Math.max(r.MTBF_MEDIO ?? 0, 0);
    const disp = Math.min(Math.max(r.DISPONIBILIDADE ?? 100, 0), 100);
    const conf = mtbf > 0 ? Math.exp(-24 / mtbf) * 100 : 0;
    return {
      mes:             `${r.ANO}-${String(r.MES).padStart(2, "0")}`,
      label:           `${MESES[r.MES - 1]}/${String(r.ANO).slice(2)}`,
      mttrMedio:       parseFloat((r.MTTR_MEDIO ?? 0).toFixed(2)),
      mtbfMedio:       parseFloat(mtbf.toFixed(2)),
      disponibilidade: parseFloat(disp.toFixed(2)),
      confiabilidade:  parseFloat(conf.toFixed(2)),
      falhas:          r.FALHAS,
      totalHhReparo:   parseFloat((r.TOTAL_HH_REPARO ?? 0).toFixed(2)),
    };
  });

  const locais = locaisResult.recordset.map((r) => r.DESCRICAO).filter(Boolean);

  return { equipamentos, tendencia, locais };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const dias = parseInt(req.nextUrl.searchParams.get("dias") ?? "365", 10) || 365;

  try {
    const { equipamentos, tendencia, locais } = await queryEngeman(dias);
    const response: IndicadoresResponse = {
      equipamentos,
      tendencia,
      locais,
      source: "db",
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error("[PCM /api/pcm/indicadores] Engeman inacessível:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Engeman inacessível" }, { status: 503 });
  }
}
