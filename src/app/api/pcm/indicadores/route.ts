export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";

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
  source: "db" | "mock";
  generatedAt: string;
}

// ── Engeman SQL Server ────────────────────────────────────────────────────────
// Banco espelho (slave) do Engeman CMMS
// Tabelas reais confirmadas: ORDSERV, APLIC, LOCAPLIC, TIPMANUT
// Tipos corretivos: CODTIPMAN IN (1=CRT, 2=CRP, 3=CRN)
// Status fechada: STATORD = 'F'
// Tempo parada: MAQPAR (início) → MAQFUN (retorno); fallback: HOREXEREA
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
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

// ── Queries ───────────────────────────────────────────────────────────────────
async function queryEngeman(diasPeriodo: number): Promise<{
  equipamentos: IndicadorEquipamento[];
  tendencia: TendenciaMensal[];
  locais: string[];
}> {
  const pool = await sql.connect(dbConfig);
  const periodoHoras = diasPeriodo * 24;

  // ── 1. Indicadores por equipamento ────────────────────────────────────────
  // MTTR = SUM(horas reparo) / nº falhas
  // MTBF = (periodo_horas - total_horas_reparo) / nº falhas
  // Disponibilidade = (1 - total_horas_reparo / periodo_horas) × 100
  // Confiabilidade R(720h) = EXP(-720 / MTBF) × 100
  //
  // Horas de reparo por OS:
  //   • Se MAQPAR e MAQFUN preenchidos → DATEDIFF(MINUTE, MAQPAR, MAQFUN)/60
  //   • Caso contrário → ISNULL(HOREXEREA, 0)
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
      SELECT
        a.CODAPL,
        a.TAG,
        RTRIM(a.DESCRICAO)                          AS DESCRICAO,
        ISNULL(RTRIM(l.DESCRICAO), 'Não informado') AS LOCAL_INSTALACAO,
        COUNT(*)                                     AS TOTAL_FALHAS,

        /* Horas totais de reparo (parada máquina) */
        SUM(
          CASE
            WHEN o.MAQPAR IS NOT NULL AND o.MAQFUN IS NOT NULL
              THEN ABS(DATEDIFF(MINUTE, o.MAQPAR, o.MAQFUN)) / 60.0
            ELSE ISNULL(o.HOREXEREA, 0)
          END
        ) AS TOTAL_HH_REPARO,

        /* MTTR */
        SUM(
          CASE
            WHEN o.MAQPAR IS NOT NULL AND o.MAQFUN IS NOT NULL
              THEN ABS(DATEDIFF(MINUTE, o.MAQPAR, o.MAQFUN)) / 60.0
            ELSE ISNULL(o.HOREXEREA, 0)
          END
        ) / NULLIF(COUNT(*), 0) AS MTTR,

        /* MTBF */
        (@periodoHoras - SUM(
          CASE
            WHEN o.MAQPAR IS NOT NULL AND o.MAQFUN IS NOT NULL
              THEN ABS(DATEDIFF(MINUTE, o.MAQPAR, o.MAQFUN)) / 60.0
            ELSE ISNULL(o.HOREXEREA, 0)
          END
        )) / NULLIF(COUNT(*), 0) AS MTBF,

        /* Disponibilidade % */
        (1.0 - SUM(
          CASE
            WHEN o.MAQPAR IS NOT NULL AND o.MAQFUN IS NOT NULL
              THEN ABS(DATEDIFF(MINUTE, o.MAQPAR, o.MAQFUN)) / 60.0
            ELSE ISNULL(o.HOREXEREA, 0)
          END
        ) / @periodoHoras) * 100.0 AS DISPONIBILIDADE

      FROM ORDSERV o
      INNER JOIN APLIC a    ON a.CODAPL    = o.CODAPL
      LEFT  JOIN LOCAPLIC l ON l.CODLOCAPL = a.CODLOCAPL

      WHERE o.CODTIPMAN IN (1, 2, 3)   -- CORRETIVA, CORRETIVA PROGRAMADA, CORRETIVA NÃO PROGRAMADA
        AND o.STATORD = 'F'            -- Fechada
        AND o.DATENT >= DATEADD(DAY, -@diasPeriodo, GETDATE())
        AND o.CODAPL IS NOT NULL

      GROUP BY a.CODAPL, a.TAG, a.DESCRICAO, l.DESCRICAO
      HAVING COUNT(*) >= 1
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
      SELECT
        YEAR(o.DATENT)  AS ANO,
        MONTH(o.DATENT) AS MES,
        COUNT(*)        AS FALHAS,

        /* MTTR */
        SUM(
          CASE
            WHEN o.MAQPAR IS NOT NULL AND o.MAQFUN IS NOT NULL
              THEN ABS(DATEDIFF(MINUTE, o.MAQPAR, o.MAQFUN)) / 60.0
            ELSE ISNULL(o.HOREXEREA, 0)
          END
        ) / NULLIF(COUNT(*), 0) AS MTTR_MEDIO,

        /* Total horas de reparo */
        SUM(
          CASE
            WHEN o.MAQPAR IS NOT NULL AND o.MAQFUN IS NOT NULL
              THEN ABS(DATEDIFF(MINUTE, o.MAQPAR, o.MAQFUN)) / 60.0
            ELSE ISNULL(o.HOREXEREA, 0)
          END
        ) AS TOTAL_HH_REPARO,

        /* Horas do mês = dias do mês × 24 */
        DAY(EOMONTH(DATEFROMPARTS(YEAR(o.DATENT), MONTH(o.DATENT), 1))) * 24.0 AS HORAS_MES,

        /* MTBF mensal = (horas_mês − hh_reparo) / falhas */
        (
          DAY(EOMONTH(DATEFROMPARTS(YEAR(o.DATENT), MONTH(o.DATENT), 1))) * 24.0
          - SUM(
              CASE
                WHEN o.MAQPAR IS NOT NULL AND o.MAQFUN IS NOT NULL
                  THEN ABS(DATEDIFF(MINUTE, o.MAQPAR, o.MAQFUN)) / 60.0
                ELSE ISNULL(o.HOREXEREA, 0)
              END
            )
        ) / NULLIF(COUNT(*), 0) AS MTBF_MEDIO,

        /* Disponibilidade = (1 − hh_reparo / horas_mês) × 100 */
        (1.0 - SUM(
          CASE
            WHEN o.MAQPAR IS NOT NULL AND o.MAQFUN IS NOT NULL
              THEN ABS(DATEDIFF(MINUTE, o.MAQPAR, o.MAQFUN)) / 60.0
            ELSE ISNULL(o.HOREXEREA, 0)
          END
        ) / (DAY(EOMONTH(DATEFROMPARTS(YEAR(o.DATENT), MONTH(o.DATENT), 1))) * 24.0)) * 100.0 AS DISPONIBILIDADE

      FROM ORDSERV o
      WHERE o.CODTIPMAN IN (1, 2, 3)
        AND o.STATORD = 'F'
        AND o.DATENT >= DATEADD(DAY, -@diasPeriodo2, GETDATE())
      GROUP BY YEAR(o.DATENT), MONTH(o.DATENT)
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
    const confiabilidade = mtbf > 0 ? Math.exp(-720 / mtbf) * 100 : 0;
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
    const conf = mtbf > 0 ? Math.exp(-720 / mtbf) * 100 : 0;
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

// ── Mock (fallback quando DB inacessível) ─────────────────────────────────────
// Equipamentos baseados nos dados reais do Engeman Tramontin
function mockData(diasPeriodo: number): { equipamentos: IndicadorEquipamento[]; tendencia: TendenciaMensal[]; locais: string[] } {
  const periodoHoras = diasPeriodo * 24;
  const equipamentos: IndicadorEquipamento[] = [
    { codApl: 269, tag: "EPA-0001", descricao: "EMPILHADEIRA BAOLI KBD30",           localInstalacao: "FROTA",                                   totalFalhas: 18, totalHorasReparo: 32.4,  mtbf: 484.9, mttr: 1.8,  disponibilidade: 99.63, confiabilidade: 22.3, periodoHoras },
    { codApl: 505, tag: "MAR-0003", descricao: "MAROMBA 01 (BERTAN)",                 localInstalacao: "LINHA DE PRODUÇÃO 1 (SECADOR ESTUFA)",     totalFalhas: 16, totalHorasReparo: 35.1,  mtbf: 545.3, mttr: 2.2,  disponibilidade: 99.60, confiabilidade: 26.5, periodoHoras },
    { codApl:  23, tag: "MES-0003", descricao: "MESA DE CORTE 03",                   localInstalacao: "LINHA DE PRODUÇÃO 1 (SECADOR ESTUFA)",     totalFalhas: 15, totalHorasReparo: 34.9,  mtbf: 581.7, mttr: 2.3,  disponibilidade: 99.60, confiabilidade: 28.7, periodoHoras },
    { codApl:  20, tag: "LAM-0001", descricao: "LAMINADOR 01",                        localInstalacao: "LINHA DE PRODUÇÃO 1 (SECADOR ESTUFA)",     totalFalhas: 15, totalHorasReparo: 65.5,  mtbf: 579.6, mttr: 4.4,  disponibilidade: 99.25, confiabilidade: 28.5, periodoHoras },
    { codApl:  84, tag: "BRT-0001", descricao: "BRITADOR MARTELO",                   localInstalacao: "CHAMOTE",                                  totalFalhas: 14, totalHorasReparo: 30.5,  mtbf: 623.5, mttr: 2.2,  disponibilidade: 99.65, confiabilidade: 31.1, periodoHoras },
    { codApl: 129, tag: "FOR-0000", descricao: "ÁREA DO FORNO",                      localInstalacao: "QUEIMA",                                   totalFalhas: 14, totalHorasReparo: 88.8,  mtbf: 619.4, mttr: 6.3,  disponibilidade: 98.99, confiabilidade: 30.9, periodoHoras },
    { codApl: 143, tag: "CRC-0003", descricao: "CARACOL EXTRUSOR 01",                localInstalacao: "LD FORNO",                                 totalFalhas: 11, totalHorasReparo: 201.6, mtbf: 778.0, mttr: 18.3, disponibilidade: 97.70, confiabilidade: 39.6, periodoHoras },
    { codApl:  55, tag: "MAR-0001", descricao: "MAROMBA 1",                          localInstalacao: "LINHA DE PRODUÇÃO 1 (SECADOR ESTUFA)",     totalFalhas: 11, totalHorasReparo: 83.4,  mtbf: 788.8, mttr: 7.6,  disponibilidade: 99.05, confiabilidade: 40.2, periodoHoras },
    { codApl: 496, tag: "EXT-0001", descricao: "EXTRATOR 01",                        localInstalacao: "ESTUFA 1",                                 totalFalhas:  9, totalHorasReparo: 24.6,  mtbf: 970.6, mttr: 2.7,  disponibilidade: 99.72, confiabilidade: 47.4, periodoHoras },
    { codApl: 123, tag: "CPA-0001", descricao: "COMPRESSOR DE AR 1",                 localInstalacao: "ÁREA DE PRODUÇÃO",                         totalFalhas:  9, totalHorasReparo: 26.6,  mtbf: 970.4, mttr: 3.0,  disponibilidade: 99.70, confiabilidade: 47.4, periodoHoras },
  ];

  const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const now = new Date();
  // Realistic mock trend: MTBF ~470h→510h, MTTR ~2.5h→3.5h, Disp ~99.3%→99.7%
  const mockMtbf  = [472, 495, 511, 483, 502, 488];
  const mockMttr  = [3.2, 2.8, 3.5, 3.1, 2.6, 3.0];
  const mockDisp  = [99.4, 99.5, 99.3, 99.6, 99.7, 99.4];
  const tendencia: TendenciaMensal[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const mtbf = mockMtbf[i];
    const mttr = mockMttr[i];
    const disp = mockDisp[i];
    const conf = Math.exp(-720 / mtbf) * 100;
    return {
      mes:             `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label:           `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
      mttrMedio:       mttr,
      mtbfMedio:       mtbf,
      disponibilidade: disp,
      confiabilidade:  parseFloat(conf.toFixed(2)),
      falhas:          Math.floor(60 + Math.random() * 50),
      totalHhReparo:   +(200 + Math.random() * 300).toFixed(2),
    };
  });

  const locais = Array.from(new Set(equipamentos.map((e) => e.localInstalacao)));
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
    console.error("[PCM /api/pcm/indicadores] Engeman inacessível, usando mock:", err instanceof Error ? err.message : err);
    const { equipamentos, tendencia, locais } = mockData(dias);
    const response: IndicadoresResponse = {
      equipamentos,
      tendencia,
      locais,
      source: "mock",
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json(response);
  }
}
