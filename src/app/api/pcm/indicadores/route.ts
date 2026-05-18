export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface IndicadorEquipamento {
  codigo: string;
  descricao: string;
  localInstalacao: string;
  totalFalhas: number;
  totalHorasReparo: number;
  mtbf: number; // hours
  mttr: number; // hours
  disponibilidade: number; // 0-100
  confiabilidade: number; // 0-100  at t=720h
  periodoHoras: number;
}

export interface TendenciaMensal {
  mes: string; // "YYYY-MM"
  label: string; // "Jan/25"
  mtbfMedio: number;
  mttrMedio: number;
  falhas: number;
}

export interface IndicadoresResponse {
  equipamentos: IndicadorEquipamento[];
  tendencia: TendenciaMensal[];
  source: "db" | "mock";
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Engeman SQL Server config
// ---------------------------------------------------------------------------
const dbConfig: sql.config = {
  server: process.env.ENGEMAN_HOST ?? "192.168.0.206",
  database: process.env.ENGEMAN_DB ?? "ENGEMAN_SLAVE",
  user: process.env.ENGEMAN_USER ?? "sa",
  password: process.env.ENGEMAN_PASS ?? "Tramontin10@",
  port: Number(process.env.ENGEMAN_PORT ?? 1433),
  options: {
    encrypt: false,
    trustServerCertificate: true,
    connectTimeout: 8000,
    requestTimeout: 15000,
  },
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// ---------------------------------------------------------------------------
// Main query against Engeman
// ---------------------------------------------------------------------------
async function queryEngeman(diasPeriodo: number): Promise<{
  equipamentos: IndicadorEquipamento[];
  tendencia: TendenciaMensal[];
}> {
  const pool = await sql.connect(dbConfig);

  const periodoHoras = diasPeriodo * 24;
  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - diasPeriodo);

  // We try to detect whether the table is APLICACAO or APLICACOES,
  // and ORDEMSERVICO or OS, by querying sys.objects first.
  const tablesResult = await pool
    .request()
    .query<{ TABLE_NAME: string }>(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`
    );

  const tables = tablesResult.recordset.map((r) => r.TABLE_NAME.toUpperCase());

  const tblAplicacao = tables.includes("APLICACAO")
    ? "APLICACAO"
    : tables.includes("APLICACOES")
    ? "APLICACOES"
    : "APLICACAO";

  const tblOS = tables.includes("ORDEMSERVICO")
    ? "ORDEMSERVICO"
    : tables.includes("OS")
    ? "OS"
    : tables.includes("ORDENSSERVICO")
    ? "ORDENSSERVICO"
    : "ORDEMSERVICO";

  const tblLocal = tables.includes("LOCALINSTALACAO")
    ? "LOCALINSTALACAO"
    : tables.includes("LOCAL")
    ? "LOCAL"
    : null;

  const localJoin = tblLocal
    ? `LEFT JOIN ${tblLocal} LI ON LI.CODIGO = A.CODIGOLOCALINSTALACAO`
    : "";
  const localSelect = tblLocal ? "ISNULL(LI.DESCRICAO, '')" : "''";

  const query = `
    WITH OS_CORRETIVAS AS (
      SELECT
        OS.CODIGOAPL,
        OS.DATAHORAABERTURA,
        OS.DATAHORAFECHAMENTO,
        CASE
          WHEN OS.DATAHORAFECHAMENTO IS NOT NULL AND OS.DATAHORAABERTURA IS NOT NULL
          THEN DATEDIFF(MINUTE, OS.DATAHORAABERTURA, OS.DATAHORAFECHAMENTO) / 60.0
          ELSE 0
        END AS HORAS_REPARO
      FROM ${tblOS} OS
      WHERE
        OS.DATAHORAABERTURA >= @dataInicio
        AND OS.DATAHORAFECHAMENTO IS NOT NULL
        AND (
          UPPER(ISNULL(OS.TIPOOS, '')) IN ('CM', 'C', 'CORRETIVA', 'COR')
          OR UPPER(ISNULL(OS.TIPOOS, '')) LIKE '%CORRET%'
        )
        AND OS.CODIGOAPL IS NOT NULL
        AND OS.CODIGOAPL <> ''
    ),
    INDICADORES AS (
      SELECT
        OC.CODIGOAPL,
        COUNT(*) AS TOTAL_FALHAS,
        SUM(OC.HORAS_REPARO) AS TOTAL_HORAS_REPARO
      FROM OS_CORRETIVAS OC
      GROUP BY OC.CODIGOAPL
    )
    SELECT
      A.CODIGO,
      A.DESCRICAO,
      ${localSelect} AS LOCAL_INSTALACAO,
      ISNULL(I.TOTAL_FALHAS, 0) AS TOTAL_FALHAS,
      ISNULL(I.TOTAL_HORAS_REPARO, 0) AS TOTAL_HORAS_REPARO
    FROM ${tblAplicacao} A
    ${localJoin}
    LEFT JOIN INDICADORES I ON I.CODIGOAPL = A.CODIGO
    WHERE
      ISNULL(A.SITUACAO, 'A') <> 'I'
      AND ISNULL(I.TOTAL_FALHAS, 0) > 0
    ORDER BY I.TOTAL_FALHAS DESC
  `;

  const equipResult = await pool
    .request()
    .input("dataInicio", sql.DateTime, dataInicio)
    .query<{
      CODIGO: string;
      DESCRICAO: string;
      LOCAL_INSTALACAO: string;
      TOTAL_FALHAS: number;
      TOTAL_HORAS_REPARO: number;
    }>(query);

  const equipamentos: IndicadorEquipamento[] = equipResult.recordset.map(
    (row) => {
      const falhas = Number(row.TOTAL_FALHAS) || 0;
      const horasReparo = Number(row.TOTAL_HORAS_REPARO) || 0;
      const uptime = Math.max(0, periodoHoras - horasReparo);
      const mtbf = falhas > 0 ? uptime / falhas : periodoHoras;
      const mttr = falhas > 0 ? horasReparo / falhas : 0;
      const disponibilidade =
        periodoHoras > 0 ? (uptime / periodoHoras) * 100 : 100;
      const confiabilidade = mtbf > 0 ? Math.exp(-720 / mtbf) * 100 : 0;

      return {
        codigo: row.CODIGO?.trim() ?? "",
        descricao: row.DESCRICAO?.trim() ?? "",
        localInstalacao: row.LOCAL_INSTALACAO?.trim() ?? "",
        totalFalhas: falhas,
        totalHorasReparo: Math.round(horasReparo * 10) / 10,
        mtbf: Math.round(mtbf * 10) / 10,
        mttr: Math.round(mttr * 10) / 10,
        disponibilidade: Math.round(disponibilidade * 10) / 10,
        confiabilidade: Math.round(confiabilidade * 10) / 10,
        periodoHoras,
      };
    }
  );

  // Trend query — group by month
  const trendQuery = `
    SELECT
      FORMAT(OS.DATAHORAABERTURA, 'yyyy-MM') AS MES,
      COUNT(*) AS FALHAS,
      AVG(
        CASE
          WHEN OS.DATAHORAFECHAMENTO IS NOT NULL
          THEN DATEDIFF(MINUTE, OS.DATAHORAABERTURA, OS.DATAHORAFECHAMENTO) / 60.0
          ELSE NULL
        END
      ) AS MTTR_MEDIO
    FROM ${tblOS} OS
    WHERE
      OS.DATAHORAABERTURA >= @dataInicio
      AND OS.DATAHORAFECHAMENTO IS NOT NULL
      AND (
        UPPER(ISNULL(OS.TIPOOS, '')) IN ('CM', 'C', 'CORRETIVA', 'COR')
        OR UPPER(ISNULL(OS.TIPOOS, '')) LIKE '%CORRET%'
      )
    GROUP BY FORMAT(OS.DATAHORAABERTURA, 'yyyy-MM')
    ORDER BY MES
  `;

  const trendResult = await pool
    .request()
    .input("dataInicio", sql.DateTime, dataInicio)
    .query<{ MES: string; FALHAS: number; MTTR_MEDIO: number }>(trendQuery);

  const mesesAbrev = [
    "Jan","Fev","Mar","Abr","Mai","Jun",
    "Jul","Ago","Set","Out","Nov","Dez",
  ];

  const tendencia: TendenciaMensal[] = trendResult.recordset.map((row) => {
    const [year, month] = row.MES.split("-");
    const monthIdx = parseInt(month, 10) - 1;
    const mttr = Number(row.MTTR_MEDIO) || 0;
    const falhas = Number(row.FALHAS) || 1;
    // Estimate MTBF for this month: (720 - totalRepair) / falhas
    const totalRepair = mttr * falhas;
    const mtbf = falhas > 0 ? Math.max(0, (720 - totalRepair) / falhas) : 720;

    return {
      mes: row.MES,
      label: `${mesesAbrev[monthIdx]}/${year.slice(2)}`,
      mtbfMedio: Math.round(mtbf * 10) / 10,
      mttrMedio: Math.round(mttr * 10) / 10,
      falhas: Number(row.FALHAS),
    };
  });

  await pool.close();
  return { equipamentos, tendencia };
}

// ---------------------------------------------------------------------------
// Mock data (fallback when DB is unreachable)
// ---------------------------------------------------------------------------
function buildMockData(diasPeriodo: number): {
  equipamentos: IndicadorEquipamento[];
  tendencia: TendenciaMensal[];
} {
  const periodoHoras = diasPeriodo * 24;

  const equipamentos: IndicadorEquipamento[] = [
    { codigo: "COMP-001", descricao: "Compressor de Ar Atlas Copco GA37", localInstalacao: "Utilidades / Sala de Compressores", totalFalhas: 3, totalHorasReparo: 9.5, mtbf: 0, mttr: 0, disponibilidade: 0, confiabilidade: 0, periodoHoras },
    { codigo: "BOMB-003", descricao: "Bomba Centrífuga Grundfos CM10", localInstalacao: "Linha de Produção 1 / Hidráulico", totalFalhas: 5, totalHorasReparo: 18.0, mtbf: 0, mttr: 0, disponibilidade: 0, confiabilidade: 0, periodoHoras },
    { codigo: "ESTE-002", descricao: "Esteira Transportadora Principal", localInstalacao: "Expedição / Área de Embalagem", totalFalhas: 2, totalHorasReparo: 4.0, mtbf: 0, mttr: 0, disponibilidade: 0, confiabilidade: 0, periodoHoras },
    { codigo: "TORN-007", descricao: "Torno CNC Romi Centur 35D", localInstalacao: "Usinagem / Célula 02", totalFalhas: 4, totalHorasReparo: 14.0, mtbf: 0, mttr: 0, disponibilidade: 0, confiabilidade: 0, periodoHoras },
    { codigo: "FRES-004", descricao: "Fresadora Universal Romi I30", localInstalacao: "Usinagem / Célula 01", totalFalhas: 1, totalHorasReparo: 2.5, mtbf: 0, mttr: 0, disponibilidade: 0, confiabilidade: 0, periodoHoras },
    { codigo: "PONT-001", descricao: "Ponte Rolante 5t Demag", localInstalacao: "Montagem / Nave Principal", totalFalhas: 6, totalHorasReparo: 22.0, mtbf: 0, mttr: 0, disponibilidade: 0, confiabilidade: 0, periodoHoras },
    { codigo: "SOLD-002", descricao: "Robô de Soldagem ABB IRB 1600", localInstalacao: "Soldagem / Célula Robótica", totalFalhas: 2, totalHorasReparo: 6.0, mtbf: 0, mttr: 0, disponibilidade: 0, confiabilidade: 0, periodoHoras },
    { codigo: "GERA-001", descricao: "Gerador de Emergência Cummins 400kVA", localInstalacao: "Utilidades / Casa de Força", totalFalhas: 1, totalHorasReparo: 3.0, mtbf: 0, mttr: 0, disponibilidade: 0, confiabilidade: 0, periodoHoras },
    { codigo: "INJET-005", descricao: "Injetora de Plástico Haitian MA900", localInstalacao: "Injeção / Área 03", totalFalhas: 7, totalHorasReparo: 28.5, mtbf: 0, mttr: 0, disponibilidade: 0, confiabilidade: 0, periodoHoras },
    { codigo: "CONV-008", descricao: "Correia Transportadora de Granéis", localInstalacao: "Recebimento / Silo 01", totalFalhas: 3, totalHorasReparo: 10.0, mtbf: 0, mttr: 0, disponibilidade: 0, confiabilidade: 0, periodoHoras },
  ].map((e) => {
    const uptime = Math.max(0, periodoHoras - e.totalHorasReparo);
    const mtbf = e.totalFalhas > 0 ? uptime / e.totalFalhas : periodoHoras;
    const mttr = e.totalFalhas > 0 ? e.totalHorasReparo / e.totalFalhas : 0;
    const disponibilidade = periodoHoras > 0 ? (uptime / periodoHoras) * 100 : 100;
    const confiabilidade = mtbf > 0 ? Math.exp(-720 / mtbf) * 100 : 0;
    return {
      ...e,
      mtbf: Math.round(mtbf * 10) / 10,
      mttr: Math.round(mttr * 10) / 10,
      disponibilidade: Math.round(disponibilidade * 10) / 10,
      confiabilidade: Math.round(confiabilidade * 10) / 10,
    };
  });

  const mesesAbrev = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const now = new Date();
  const tendencia: TendenciaMensal[] = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const seed = i + 1;
    const falhas = 3 + Math.round(seed % 5);
    const mttr = 2 + (seed % 3) * 0.8;
    const totalRepair = mttr * falhas;
    const mtbf = Math.max(0, (720 - totalRepair) / falhas);
    return {
      mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${mesesAbrev[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
      mtbfMedio: Math.round(mtbf * 10) / 10,
      mttrMedio: Math.round(mttr * 10) / 10,
      falhas,
    };
  });

  return { equipamentos, tendencia };
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dias = Math.min(
    Math.max(Number(searchParams.get("dias") ?? 365), 30),
    730
  );

  try {
    const data = await queryEngeman(dias);
    const response: IndicadoresResponse = {
      ...data,
      source: "db",
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json(response);
  } catch (err) {
    console.warn("[PCM] DB unreachable, using mock data:", (err as Error).message);
    const mock = buildMockData(dias);
    const response: IndicadoresResponse = {
      ...mock,
      source: "mock",
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json(response);
  }
}
