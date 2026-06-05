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
  mtbf: number;           // horas entre falhas
  mttr: number;           // MTTR padrão (janela MAQPAR→MAQFUN + ORDXPAR)
  mttrEfetivo: number;    // MTTR efetivo (TEMPO_EFETIVO, EXECUTADO='S', SIMULA='R')
  disponibilidade: number; // 0–100 %
  confiabilidade: number;  // R(90d) = e^(−n/8760 × 2160) × 100  (Engeman-nativa)
  periodoHoras: number;
}

export interface TendenciaMensal {
  mes: string;               // "YYYY-MM"
  label: string;             // "Jan/25"
  mttrMedio: number;         // h — MTTR padrão
  mttrEfetivoMedio: number;  // h — MTTR efetivo
  mtbfMedio: number;         // h
  disponibilidade: number;   // %
  confiabilidade: number;    // R(90d) = e^(−n/horas_mês × 2160) × 100
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
// Tabelas: ORDSERV, REGSERV, APLIC, LOCAPLIC, TIPMANUT
// MTBF/MTTR/Disp  → REGSERV.CODDEF IS NOT NULL  + DATPRO  (período selecionado)
// Confiabilidade  → REGSERV.DEFCAU = 'S' + STATORD='F' + DATPRO2 (sempre 365d)
//   R(90d) = EXP(−n / (365×24) × (90×24)) × 100  (fórmula Engeman-nativa)
// Filial válida: CODFIL NOT IN (0)
// Tempo de parada: janela MAQPAR→MAQFUN + paradas adicionais (ORDXPAR). NÃO usa HOREXEREA (homem-hora).

// ── Queries ───────────────────────────────────────────────────────────────────
async function queryEngeman(diasPeriodo: number, codApls?: number[]): Promise<{
  equipamentos: IndicadorEquipamento[];
  tendencia: TendenciaMensal[];
  locais: string[];
}> {
  const pool = await sql.connect(await getEngemanConfig());
  const periodoHoras = diasPeriodo * 24;
  const codAplList = codApls && codApls.length > 0 ? codApls.join(",") : null;

  // ── 1. Indicadores por equipamento ────────────────────────────────────────
  // Fórmula Engeman-nativa (usando período selecionado como base de tempo):
  //   Falha confirmada = OS com REGSERV.CODDEF IS NOT NULL (defeito registrado)
  //   MTBF  = periodoHoras / COUNT(DISTINCT CODORD)
  //           (tempo total do período ÷ nº de falhas — padrão confiabilidade)
  //   MTTR  = horas de parada / nº de OS  (MAQPAR→MAQFUN + ORDXPAR)
  //   Disponibilidade % = MTBF / (MTBF + MTTR) × 100
  //   Confiabilidade R(24h) = e^(-24/MTBF) × 100
  //
  // DATPRO = data de programação/fechamento da OS (data real da falha no Engeman)
  // CODFIL NOT IN (0) = exclui filial zero (padrão do sistema)
  const indResult = await pool.request()
    .input("diasPeriodo", sql.Int, diasPeriodo)
    .input("periodoHoras", sql.Float, periodoHoras)
    .input("codAplList", sql.VarChar(sql.MAX), codAplList)
    .query<{
      CODAPL: number;
      TAG: string;
      DESCRICAO: string;
      LOCAL_INSTALACAO: string;
      TOTAL_FALHAS: number;
      TOTAL_HH_REPARO: number;
      MTTR: number;
      MTTR_EFETIVO: number;
      MTBF: number;
      DISPONIBILIDADE: number;
      CONFIABILIDADE: number;
    }>(`
      /* MTBF/MTTR: falhas com defeito registrado (CODDEF IS NOT NULL) no período */
      WITH FALHAS AS (
        SELECT
          o.CODAPL,
          o.CODORD,
          /* Parada = janela de máquina parada (MAQPAR→MAQFUN) + adicionais (ORDXPAR).
             Sem carimbo → 0h. NÃO usa HOREXEREA (homem-hora de mão de obra: soma dos
             REGSERV, pode se sobrepor entre trabalhadores; não é tempo de máquina parada). */
          ((CASE
            WHEN o.MAQPAR IS NOT NULL AND o.MAQFUN IS NOT NULL
              THEN ABS(DATEDIFF(MINUTE, o.MAQPAR, o.MAQFUN)) / 60.0
            ELSE 0
          END)
          + ISNULL(xpa.H_ADD, 0)) AS HH_REPARO
        FROM ORDSERV o
        INNER JOIN REGSERV r ON r.CODORD = o.CODORD
        /* Paradas adicionais (ORDXPAR) pré-agregadas por OS num LEFT JOIN derivado —
           não dá pra usar subconsulta com SUM dentro de outro SUM no SQL Server. */
        LEFT JOIN (
          SELECT xp.CODORD,
            SUM(CASE WHEN xp.MAQPAR IS NOT NULL AND xp.MAQFUN IS NOT NULL
              THEN ABS(DATEDIFF(MINUTE, xp.MAQPAR, xp.MAQFUN)) / 60.0
              ELSE ISNULL(xp.HORINTPARAD, 0) END) AS H_ADD
          FROM ORDXPAR xp
          GROUP BY xp.CODORD
        ) xpa ON xpa.CODORD = o.CODORD
        WHERE r.CODDEF IS NOT NULL
          AND o.CODAPL IS NOT NULL
          AND o.CODFIL NOT IN (0)
          AND o.DATPRO >= DATEADD(DAY, -@diasPeriodo, GETDATE())
          AND (@codAplList IS NULL OR o.CODAPL IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@codAplList, ',')))
      ),
      /* Confiabilidade: fórmula Engeman (DEFCAU='S', STATORD='F', DATPRO2, sempre 365d) */
      CONF AS (
        SELECT o.CODAPL, COUNT(DISTINCT o.CODORD) AS N
        FROM ORDSERV o
        INNER JOIN REGSERV r ON r.CODORD = o.CODORD
        WHERE r.DEFCAU = 'S'
          AND o.STATORD = 'F'
          AND o.CODAPL IS NOT NULL
          AND o.CODFIL NOT IN (0)
          AND o.DATPRO2 BETWEEN CONVERT(DATE, GETDATE()-365) AND CONVERT(DATE, GETDATE())
          AND (@codAplList IS NULL OR o.CODAPL IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@codAplList, ',')))
        GROUP BY o.CODAPL
      ),
      /* MTTR Efetivo: usa TEMPO_EFETIVO, EXECUTADO='S', STATORD<>'C', SIMULA='R' */
      MTTR_EF AS (
        SELECT
          o.CODAPL,
          COUNT(r.CODORD)                         AS N_EF,
          SUM(ISNULL(o.TEMPO_EFETIVO, 0))         AS TEMPO_TOTAL_EF
        FROM ORDSERV o
        INNER JOIN (
          SELECT CODORD FROM REGSERV
          WHERE CODDEF IS NOT NULL AND EXECUTADO = 'S'
          GROUP BY CODORD
        ) r ON r.CODORD = o.CODORD
        WHERE o.STATORD <> 'C'
          AND o.SIMULA   = 'R'
          AND o.CODAPL  IS NOT NULL
          AND o.CODFIL  NOT IN (0)
          AND o.DATPRO  >= DATEADD(DAY, -@diasPeriodo, GETDATE())
          AND (@codAplList IS NULL OR o.CODAPL IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@codAplList, ',')))
        GROUP BY o.CODAPL
      )
      SELECT
        a.CODAPL,
        RTRIM(ISNULL(a.TAG, CAST(a.CODAPL AS VARCHAR(20)))) AS TAG,
        RTRIM(a.DESCRICAO)                          AS DESCRICAO,
        ISNULL(RTRIM(l.DESCRICAO), 'Não informado') AS LOCAL_INSTALACAO,

        /* Falhas = OS distintas com defeito registrado no período */
        COUNT(DISTINCT f.CODORD) AS TOTAL_FALHAS,

        /* Horas totais de reparo */
        SUM(f.HH_REPARO) AS TOTAL_HH_REPARO,

        /* MTTR padrão = horas de parada / nº falhas (MAQPAR→MAQFUN + ORDXPAR) */
        SUM(f.HH_REPARO) / NULLIF(COUNT(DISTINCT f.CODORD), 0) AS MTTR,

        /* MTTR Efetivo = SUM(TEMPO_EFETIVO) / COUNT(OS executadas) */
        ROUND(
          CASE WHEN ISNULL(ef.N_EF, 0) > 0
            THEN ef.TEMPO_TOTAL_EF / CAST(ef.N_EF AS FLOAT)
            ELSE 0
          END, 2
        ) AS MTTR_EFETIVO,

        /* MTBF = período total (h) / nº falhas — considera o período selecionado */
        @periodoHoras / NULLIF(COUNT(DISTINCT f.CODORD), 0) AS MTBF,

        /* Disponibilidade = MTBF / (MTBF + MTTR) × 100 */
        (@periodoHoras / NULLIF(COUNT(DISTINCT f.CODORD), 0)) /
          NULLIF(
            (@periodoHoras / NULLIF(COUNT(DISTINCT f.CODORD), 0))
            + (SUM(f.HH_REPARO) / NULLIF(COUNT(DISTINCT f.CODORD), 0)),
          0) * 100.0 AS DISPONIBILIDADE,

        /* Confiabilidade R(90d) = EXP(−n/(365×24) × (90×24)) × 100  (Engeman-nativa) */
        CASE
          WHEN ISNULL(c.N, 0) = 0 THEN 100.0
          ELSE ROUND(EXP((-CAST(c.N AS FLOAT) / (365.0 * 24.0)) * (90.0 * 24.0)) * 100.0, 2)
        END AS CONFIABILIDADE

      FROM FALHAS f
      INNER JOIN APLIC    a  ON a.CODAPL    = f.CODAPL
      LEFT  JOIN LOCAPLIC l  ON l.CODLOCAPL = a.CODLOCAPL
      LEFT  JOIN CONF     c  ON c.CODAPL    = f.CODAPL
      LEFT  JOIN MTTR_EF  ef ON ef.CODAPL   = f.CODAPL

      /* a.TAG precisa entrar no GROUP BY porque é SELECIONADO fora de agregação (linha
         "AS TAG"); o SQL Server exige isso e não relaxa por dependência funcional. Como
         CODAPL é PK de APLIC, agrupar também por TAG não muda a cardinalidade. */
      GROUP BY a.CODAPL, a.TAG, a.DESCRICAO, l.DESCRICAO, c.N, ef.N_EF, ef.TEMPO_TOTAL_EF
      HAVING COUNT(DISTINCT f.CODORD) >= 1
      ORDER BY TOTAL_FALHAS DESC
    `);

  // ── 2. Tendência mensal ───────────────────────────────────────────────────
  // Para cada mês, o "período" é o total de horas daquele mês calendário.
  // MTBF_MEDIO = horas_mês / falhas_mês  (consistente com a query por equipamento)
  const trendResult = await pool.request()
    .input("diasPeriodo2", sql.Int, diasPeriodo)
    .input("codAplList", sql.VarChar(sql.MAX), codAplList)
    .query<{
      ANO: number;
      MES: number;
      FALHAS: number;
      MTTR_MEDIO: number;
      MTTR_EFETIVO_MEDIO: number;
      TOTAL_HH_REPARO: number;
      HORAS_MES: number;
      MTBF_MEDIO: number;
      DISPONIBILIDADE: number;
    }>(`
      WITH FALHAS2 AS (
        SELECT
          YEAR(o.DATPRO)  AS ANO,
          MONTH(o.DATPRO) AS MES,
          o.CODORD,
          /* Parada = janela MAQPAR→MAQFUN + adicionais (ORDXPAR). Sem carimbo → 0h.
             NÃO usa HOREXEREA (homem-hora, pode se sobrepor; não é tempo de máquina). */
          ((CASE
            WHEN o.MAQPAR IS NOT NULL AND o.MAQFUN IS NOT NULL
              THEN ABS(DATEDIFF(MINUTE, o.MAQPAR, o.MAQFUN)) / 60.0
            ELSE 0
          END)
          + ISNULL(xpa.H_ADD, 0)) AS HH_REPARO
        FROM ORDSERV o
        INNER JOIN REGSERV r ON r.CODORD = o.CODORD
        LEFT JOIN (
          SELECT xp.CODORD,
            SUM(CASE WHEN xp.MAQPAR IS NOT NULL AND xp.MAQFUN IS NOT NULL
              THEN ABS(DATEDIFF(MINUTE, xp.MAQPAR, xp.MAQFUN)) / 60.0
              ELSE ISNULL(xp.HORINTPARAD, 0) END) AS H_ADD
          FROM ORDXPAR xp
          GROUP BY xp.CODORD
        ) xpa ON xpa.CODORD = o.CODORD
        WHERE r.CODDEF IS NOT NULL
          AND o.CODAPL IS NOT NULL
          AND o.CODFIL NOT IN (0)
          AND o.DATPRO >= DATEADD(DAY, -@diasPeriodo2, GETDATE())
          AND (@codAplList IS NULL OR o.CODAPL IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@codAplList, ',')))
      ),
      /* MTTR Efetivo mensal */
      MTTR_EF2 AS (
        SELECT
          YEAR(o.DATPRO)  AS ANO,
          MONTH(o.DATPRO) AS MES,
          COUNT(r.CODORD)                   AS N_EF,
          SUM(ISNULL(o.TEMPO_EFETIVO, 0))   AS TEMPO_TOTAL_EF
        FROM ORDSERV o
        INNER JOIN (
          SELECT CODORD FROM REGSERV
          WHERE CODDEF IS NOT NULL AND EXECUTADO = 'S'
          GROUP BY CODORD
        ) r ON r.CODORD = o.CODORD
        WHERE o.STATORD <> 'C'
          AND o.SIMULA   = 'R'
          AND o.CODAPL  IS NOT NULL
          AND o.CODFIL  NOT IN (0)
          AND o.DATPRO  >= DATEADD(DAY, -@diasPeriodo2, GETDATE())
          AND (@codAplList IS NULL OR o.CODAPL IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@codAplList, ',')))
        GROUP BY YEAR(o.DATPRO), MONTH(o.DATPRO)
      )
      SELECT
        f.ANO,
        f.MES,

        /* Falhas = OS distintas com defeito registrado no mês */
        COUNT(DISTINCT f.CODORD) AS FALHAS,

        /* MTTR padrão = horas / falhas */
        SUM(f.HH_REPARO) / NULLIF(COUNT(DISTINCT f.CODORD), 0) AS MTTR_MEDIO,

        /* MTTR Efetivo mensal */
        ROUND(
          CASE WHEN ISNULL(ef.N_EF, 0) > 0
            THEN ef.TEMPO_TOTAL_EF / CAST(ef.N_EF AS FLOAT)
            ELSE 0
          END, 2
        ) AS MTTR_EFETIVO_MEDIO,

        /* Horas totais */
        SUM(f.HH_REPARO) AS TOTAL_HH_REPARO,

        /* Horas calendário do mês (período do mês) */
        DAY(EOMONTH(DATEFROMPARTS(f.ANO, f.MES, 1))) * 24.0 AS HORAS_MES,

        /* MTBF = horas_mês / nº falhas — usa o período do mês como base */
        (DAY(EOMONTH(DATEFROMPARTS(f.ANO, f.MES, 1))) * 24.0) /
          NULLIF(COUNT(DISTINCT f.CODORD), 0) AS MTBF_MEDIO,

        /* Disponibilidade = MTBF / (MTBF + MTTR) × 100 */
        ((DAY(EOMONTH(DATEFROMPARTS(f.ANO, f.MES, 1))) * 24.0) / NULLIF(COUNT(DISTINCT f.CODORD), 0)) /
          NULLIF(
            ((DAY(EOMONTH(DATEFROMPARTS(f.ANO, f.MES, 1))) * 24.0) / NULLIF(COUNT(DISTINCT f.CODORD), 0))
            + (SUM(f.HH_REPARO) / NULLIF(COUNT(DISTINCT f.CODORD), 0)),
          0) * 100.0 AS DISPONIBILIDADE

      FROM FALHAS2 f
      LEFT JOIN MTTR_EF2 ef ON ef.ANO = f.ANO AND ef.MES = f.MES
      GROUP BY f.ANO, f.MES, ef.N_EF, ef.TEMPO_TOTAL_EF
      HAVING COUNT(DISTINCT f.CODORD) >= 1
      ORDER BY f.ANO, f.MES
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
    return {
      codApl:           r.CODAPL,
      tag:              r.TAG ?? "",
      descricao:        r.DESCRICAO ?? "",
      localInstalacao:  r.LOCAL_INSTALACAO ?? "Não informado",
      totalFalhas:      r.TOTAL_FALHAS,
      totalHorasReparo: parseFloat((r.TOTAL_HH_REPARO ?? 0).toFixed(2)),
      mtbf:             parseFloat(Math.max(r.MTBF ?? 0, 0).toFixed(2)),
      mttr:             parseFloat((r.MTTR ?? 0).toFixed(2)),
      mttrEfetivo:      parseFloat((r.MTTR_EFETIVO ?? 0).toFixed(2)),
      disponibilidade:  parseFloat(Math.min(r.DISPONIBILIDADE ?? 100, 100).toFixed(2)),
      confiabilidade:   parseFloat(Math.min(r.CONFIABILIDADE ?? 100, 100).toFixed(2)),
      periodoHoras,
    };
  });

  const tendencia: TendenciaMensal[] = trendResult.recordset.map((r) => {
    const mtbf = Math.max(r.MTBF_MEDIO ?? 0, 0);
    const disp  = Math.min(Math.max(r.DISPONIBILIDADE ?? 100, 0), 100);
    // R(90d) adaptada ao mês: λ = falhas / horas_mês; R = e^(−λ × 2160) × 100
    const horasMes = r.HORAS_MES ?? (30 * 24);
    const lambda = r.FALHAS > 0 ? r.FALHAS / horasMes : 0;
    const conf   = lambda > 0 ? Math.exp(-lambda * 90 * 24) * 100 : 100;
    return {
      mes:                `${r.ANO}-${String(r.MES).padStart(2, "0")}`,
      label:              `${MESES[r.MES - 1]}/${String(r.ANO).slice(2)}`,
      mttrMedio:          parseFloat((r.MTTR_MEDIO ?? 0).toFixed(2)),
      mttrEfetivoMedio:   parseFloat((r.MTTR_EFETIVO_MEDIO ?? 0).toFixed(2)),
      mtbfMedio:          parseFloat(mtbf.toFixed(2)),
      disponibilidade:    parseFloat(disp.toFixed(2)),
      confiabilidade:     parseFloat(Math.min(conf, 100).toFixed(2)),
      falhas:             r.FALHAS,
      totalHhReparo:      parseFloat((r.TOTAL_HH_REPARO ?? 0).toFixed(2)),
    };
  });

  const locais = locaisResult.recordset.map((r) => r.DESCRICAO).filter(Boolean);

  return { equipamentos, tendencia, locais };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const dias = parseInt(req.nextUrl.searchParams.get("dias") ?? "365", 10) || 365;
  const codAplsParam = req.nextUrl.searchParams.get("codApls");
  const codApls = codAplsParam
    ? codAplsParam.split(",").map(Number).filter((n) => !isNaN(n) && n > 0)
    : undefined;

  try {
    const { equipamentos, tendencia, locais } = await queryEngeman(dias, codApls);
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
