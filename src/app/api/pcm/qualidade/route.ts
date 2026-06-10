export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import sql from "mssql";
import { getEngemanConfig } from "@/lib/engeman";

export interface OsSemEquipamento {
  codord: number;
  datent: string;
  tipo: string;
}

export interface EquipamentoSemLocal {
  codApl: number;
  tag: string;
  descricao: string;
}

export interface OsTempoLongo {
  codord: number;
  equip: string;
  tag: string;
  maqpar: string;
  maqfun: string;
  hhReparo: number;
}

export interface QualidadeResponse {
  periodo: number; // dias analisados
  totalCorretivas: number;
  // Crítico
  osSemEquipamento: { total: number; pct: number; lista: OsSemEquipamento[] };
  // Importante
  comMaqparMaqfun:   { total: number; pct: number };
  semMaqparComHh:    { total: number; pct: number };
  semNenhumTempo:    { total: number; pct: number };
  // Complementar
  equipSemLocal:     { total: number; totalAtivos: number; lista: EquipamentoSemLocal[] };
  osTempoLongo:      { total: number; lista: OsTempoLongo[] };
  // Resumo score (0-100)
  score: number;
  source: "db";
  generatedAt: string;
}


async function queryQualidade(dias: number): Promise<Omit<QualidadeResponse, "source" | "generatedAt">> {
  const pool = await sql.connect(await getEngemanConfig());
  const q = async <T>(query: string) =>
    (await pool.request().input("dias", sql.Int, dias).query<T>(query)).recordset;

  // Totais e cobertura de tempo
  const [cob] = await q<{
    TOTAL: number; COM_MAQPAR: number; SEM_MAQPAR_COM_HH: number; SEM_NENHUM: number; SEM_APL: number;
  }>(`
    SELECT
      COUNT(*) AS TOTAL,
      SUM(CASE WHEN MAQPAR IS NOT NULL AND MAQFUN IS NOT NULL THEN 1 ELSE 0 END) AS COM_MAQPAR,
      SUM(CASE WHEN (MAQPAR IS NULL OR MAQFUN IS NULL) AND ISNULL(HOREXEREA,0) > 0 THEN 1 ELSE 0 END) AS SEM_MAQPAR_COM_HH,
      SUM(CASE WHEN (MAQPAR IS NULL OR MAQFUN IS NULL) AND ISNULL(HOREXEREA,0) = 0 THEN 1 ELSE 0 END) AS SEM_NENHUM,
      SUM(CASE WHEN CODAPL IS NULL THEN 1 ELSE 0 END) AS SEM_APL
    FROM ORDSERV
    WHERE CODTIPMAN IN (1,2,3) AND STATORD = 'F'
      AND DATENT >= DATEADD(DAY, -@dias, GETDATE())
  `);

  // OS sem equipamento — 30 mais recentes
  const semAplLista = await q<{ CODORD: number; DATENT: string; TIPO: string }>(`
    SELECT TOP 30
      o.CODORD,
      CONVERT(varchar(16), o.DATENT, 120) AS DATENT,
      ISNULL(t.DESCRICAO, 'N/D') AS TIPO
    FROM ORDSERV o
    LEFT JOIN TIPMANUT t ON t.CODTIPMAN = o.CODTIPMAN
    WHERE o.CODTIPMAN IN (1,2,3) AND o.STATORD = 'F'
      AND o.CODAPL IS NULL AND o.DATENT >= DATEADD(DAY, -@dias, GETDATE())
    ORDER BY o.DATENT DESC
  `);

  // Equipamentos sem local
  const equipSemLocLista = await q<{ CODAPL: number; TAG: string; DESCRICAO: string }>(`
    SELECT CODAPL, CAST(CODAPL AS VARCHAR(20)) AS TAG, RTRIM(DESCRICAO) AS DESCRICAO
    FROM APLIC WHERE CODLOCAPL IS NULL AND ATIVO = 'S'
    ORDER BY CODAPL
  `);
  const [totAtivos] = await q<{ QTD: number }>(`SELECT COUNT(*) AS QTD FROM APLIC WHERE ATIVO='S'`);

  // OS com tempo longo (> 72h)
  const osLongasLista = await q<{
    CODORD: number; EQUIP: string; TAG: string;
    MAQPAR: string; MAQFUN: string; HH: number;
  }>(`
    SELECT
      o.CODORD,
      ISNULL(RTRIM(a.DESCRICAO), 'Sem equipamento') AS EQUIP,
      ISNULL(CAST(a.CODAPL AS VARCHAR(20)), '—') AS TAG,
      CONVERT(varchar(16), o.MAQPAR, 120) AS MAQPAR,
      CONVERT(varchar(16), o.MAQFUN, 120) AS MAQFUN,
      DATEDIFF(HOUR, o.MAQPAR, o.MAQFUN) AS HH
    FROM ORDSERV o
    LEFT JOIN APLIC a ON a.CODAPL = o.CODAPL
    WHERE o.CODTIPMAN IN (1,2,3) AND o.STATORD = 'F'
      AND o.MAQPAR IS NOT NULL AND o.MAQFUN IS NOT NULL
      AND DATEDIFF(HOUR, o.MAQPAR, o.MAQFUN) > 72
      AND o.DATENT >= DATEADD(DAY, -@dias, GETDATE())
    ORDER BY HH DESC
  `);

  await pool.close();

  const total = cob.TOTAL || 1;
  const pct = (n: number) => parseFloat(((n / total) * 100).toFixed(1));

  // Score: penaliza OS sem equipamento (peso 40), sem tempo (peso 30), equipamentos sem local (peso 15), OS longas (peso 15)
  const scoreOsApl   = Math.max(0, 100 - (cob.SEM_APL / total) * 100);
  const scoreTempo   = Math.max(0, 100 - (cob.SEM_NENHUM / total) * 100);
  const scoreLocApl  = totAtivos.QTD > 0 ? Math.max(0, 100 - (equipSemLocLista.length / totAtivos.QTD) * 100) : 100;
  const scoreOsLong  = Math.max(0, 100 - Math.min(osLongasLista.length * 5, 100));
  const score = Math.round(scoreOsApl * 0.40 + scoreTempo * 0.30 + scoreLocApl * 0.15 + scoreOsLong * 0.15);

  return {
    periodo: dias,
    totalCorretivas: cob.TOTAL,
    osSemEquipamento: {
      total: cob.SEM_APL,
      pct: pct(cob.SEM_APL),
      lista: semAplLista.map((r) => ({ codord: r.CODORD, datent: r.DATENT, tipo: r.TIPO })),
    },
    comMaqparMaqfun:  { total: cob.COM_MAQPAR,       pct: pct(cob.COM_MAQPAR) },
    semMaqparComHh:   { total: cob.SEM_MAQPAR_COM_HH, pct: pct(cob.SEM_MAQPAR_COM_HH) },
    semNenhumTempo:   { total: cob.SEM_NENHUM,         pct: pct(cob.SEM_NENHUM) },
    equipSemLocal: {
      total: equipSemLocLista.length,
      totalAtivos: totAtivos.QTD,
      lista: equipSemLocLista.map((r) => ({ codApl: r.CODAPL, tag: r.TAG, descricao: r.DESCRICAO })),
    },
    osTempoLongo: {
      total: osLongasLista.length,
      lista: osLongasLista.map((r) => ({
        codord: r.CODORD, equip: r.EQUIP, tag: r.TAG,
        maqpar: r.MAQPAR, maqfun: r.MAQFUN, hhReparo: r.HH,
      })),
    },
    score,
  };
}

export async function GET() {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  try {
    const data = await queryQualidade(365);
    return NextResponse.json({ ...data, source: "db", generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[PCM qualidade] DB offline:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Engeman inacessível" }, { status: 503 });
  }
}
