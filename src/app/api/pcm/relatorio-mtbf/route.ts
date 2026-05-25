export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getEngemanConfig } from "@/lib/engeman";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface MtbfMensal {
  mes: string;      // "YYYY-MM"
  label: string;    // "Jan/25"
  falhas: number;
  mtbf: number | null; // horas — null quando só há 1 OS no mês (DATEDIFF = 0)
}

export interface MtbfAplicacaoResponse {
  codApl: number;
  tag: string;
  descricao: string;
  // ── MTBF acumulado (fórmula exata do usuário) ──────────────────────────────
  // ROUND((DATEDIFF(MI, DATAMENOR, DATAMAIOR) / 60.0), 2) / QTDEOS
  mtbfAtual: number | null;   // horas — null = sem dados suficientes
  totalFalhas: number;
  dataInicio: string | null;  // ISO string da OS mais antiga
  dataFim: string | null;     // ISO string da OS mais recente
  // ── Tendência mensal (últimos 6 meses) ────────────────────────────────────
  tendencia: MtbfMensal[];
  source: "db";
  generatedAt: string;
}

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// ── Query principal ────────────────────────────────────────────────────────────
async function queryMtbf(codApl: number, codemp: number): Promise<{
  atual: {
    mtbf: number | null;
    totalFalhas: number;
    dataInicio: Date | null;
    dataFim: Date | null;
  };
  tendencia: MtbfMensal[];
  aplicacao: { codApl: number; tag: string; descricao: string };
}> {
  const pool = await sql.connect(await getEngemanConfig());

  try {
    // ── 1. Dados da aplicação ──────────────────────────────────────────────
    const aplResult = await pool.request()
      .input("codApl", sql.Int, codApl)
      .query<{ CODAPL: number; TAG: string; DESCRICAO: string }>(`
        SELECT
          a.CODAPL,
          RTRIM(ISNULL(a.TAG, CAST(a.CODAPL AS VARCHAR(20)))) AS TAG,
          RTRIM(ISNULL(a.DESCRICAO, 'Sem descrição'))          AS DESCRICAO
        FROM APLIC a
        WHERE a.CODAPL = @codApl
      `);

    const aplRow = aplResult.recordset[0];

    // ── 2. MTBF acumulado — fórmula exata fornecida pelo usuário ──────────
    //  ROUND((DATEDIFF(MI, DATAMENOR, DATAMAIOR) / 60.0), 2) / QTDEOS
    const mtbfResult = await pool.request()
      .input("codApl",  sql.Int, codApl)
      .input("codemp",  sql.Int, codemp)
      .query<{
        MTBF: number | null;
        QTDEOS: number;
        DATAMENOR: Date | null;
        DATAMAIOR: Date | null;
      }>(`
        SELECT
          CASE
            WHEN X.QTDEOS > 1
              THEN ROUND((DATEDIFF(MI, X.DATAMENOR, X.DATAMAIOR) / 60.0), 2) / X.QTDEOS
            ELSE NULL
          END AS MTBF,
          X.QTDEOS,
          X.DATAMENOR,
          X.DATAMAIOR
        FROM (
          SELECT
            MAX(ORDSERV.DATPRO)             AS DATAMAIOR,
            MIN(ORDSERV.DATPRO)             AS DATAMENOR,
            COUNT(DISTINCT ORDSERV.CODORD)  AS QTDEOS
          FROM ORDSERV
          INNER JOIN REGSERV ON REGSERV.CODORD = ORDSERV.CODORD
          WHERE REGSERV.CODDEF IS NOT NULL
            AND ORDSERV.CODAPL  = @codApl
            AND ORDSERV.CODEMP  = @codemp
            AND ORDSERV.CODFIL NOT IN (0)
        ) X
      `);

    const mtbfRow = mtbfResult.recordset[0];

    // ── 3. Tendência mensal — últimos 6 meses completos ───────────────────
    //  Mesma fórmula, agrupada por ANO/MES (dentro do mês: min→max DATPRO)
    const trendResult = await pool.request()
      .input("codApl", sql.Int, codApl)
      .input("codemp", sql.Int, codemp)
      .query<{
        ANO: number;
        MES: number;
        QTDEOS: number;
        DATAMENOR: Date;
        DATAMAIOR: Date;
        MTBF: number | null;
      }>(`
        SELECT
          YEAR(ORDSERV.DATPRO)            AS ANO,
          MONTH(ORDSERV.DATPRO)           AS MES,
          COUNT(DISTINCT ORDSERV.CODORD)  AS QTDEOS,
          MIN(ORDSERV.DATPRO)             AS DATAMENOR,
          MAX(ORDSERV.DATPRO)             AS DATAMAIOR,
          CASE
            WHEN COUNT(DISTINCT ORDSERV.CODORD) > 1
              THEN ROUND(
                (DATEDIFF(MI, MIN(ORDSERV.DATPRO), MAX(ORDSERV.DATPRO)) / 60.0), 2
              ) / COUNT(DISTINCT ORDSERV.CODORD)
            ELSE NULL
          END AS MTBF
        FROM ORDSERV
        INNER JOIN REGSERV ON REGSERV.CODORD = ORDSERV.CODORD
        WHERE REGSERV.CODDEF IS NOT NULL
          AND ORDSERV.CODAPL  = @codApl
          AND ORDSERV.CODEMP  = @codemp
          AND ORDSERV.CODFIL NOT IN (0)
          AND ORDSERV.DATPRO >= DATEADD(MONTH, -6, GETDATE())
        GROUP BY YEAR(ORDSERV.DATPRO), MONTH(ORDSERV.DATPRO)
        ORDER BY ANO, MES
      `);

    const tendencia: MtbfMensal[] = trendResult.recordset.map((r) => ({
      mes:    `${r.ANO}-${String(r.MES).padStart(2, "0")}`,
      label:  `${MESES[r.MES - 1]}/${String(r.ANO).slice(2)}`,
      falhas: r.QTDEOS,
      mtbf:   r.MTBF != null ? parseFloat(r.MTBF.toFixed(2)) : null,
    }));

    return {
      atual: {
        mtbf:        mtbfRow?.MTBF != null ? parseFloat(mtbfRow.MTBF.toFixed(2)) : null,
        totalFalhas: mtbfRow?.QTDEOS ?? 0,
        dataInicio:  mtbfRow?.DATAMENOR ?? null,
        dataFim:     mtbfRow?.DATAMAIOR ?? null,
      },
      tendencia,
      aplicacao: aplRow
        ? { codApl: aplRow.CODAPL, tag: aplRow.TAG, descricao: aplRow.DESCRICAO }
        : { codApl, tag: String(codApl), descricao: "Aplicação não encontrada" },
    };
  } finally {
    await pool.close();
  }
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const codAplParam = searchParams.get("codApl");
  const codemParam  = searchParams.get("codemp");

  if (!codAplParam) {
    return NextResponse.json({ error: "Parâmetro codApl obrigatório" }, { status: 400 });
  }

  const codApl = parseInt(codAplParam, 10);
  const codemp = parseInt(codemParam ?? "1", 10);

  if (isNaN(codApl) || codApl <= 0) {
    return NextResponse.json({ error: "codApl inválido" }, { status: 400 });
  }

  try {
    const { atual, tendencia, aplicacao } = await queryMtbf(codApl, codemp);

    const response: MtbfAplicacaoResponse = {
      codApl:      aplicacao.codApl,
      tag:         aplicacao.tag,
      descricao:   aplicacao.descricao,
      mtbfAtual:   atual.mtbf,
      totalFalhas: atual.totalFalhas,
      dataInicio:  atual.dataInicio?.toISOString() ?? null,
      dataFim:     atual.dataFim?.toISOString() ?? null,
      tendencia,
      source:      "db",
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[PCM /api/pcm/relatorio-mtbf] Engeman inacessível:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Engeman inacessível. Verifique a conexão com o banco Engeman." }, { status: 503 });
  }
}
