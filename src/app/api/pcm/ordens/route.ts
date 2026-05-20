export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getEngemanConfig } from "@/lib/engeman";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PeriodoOS {
  label: string;       // "11/02 - 15/02" or "Jan/25"
  criadas: number;
  concluidas: number;
  preventivas: number;
  corretivas: number;
}

export interface DetalheOS {
  codord: number;
  titulo: string;
  local: string;
  equipamento: string;
  tipo: string;
  statord: string;
  prioridade: string | null;
  datent: string;  // "YYYY-MM-DD HH:mm"
}

export interface OrdensResponse {
  periodo: number;
  agrupamento: string;
  totais: { criadas: number; concluidas: number; indiceConclusao: number };
  tipoTotais: { preventivas: number; corretivas: number; pctPreventivas: number };
  periodos: PeriodoOS[];
  status: {
    emAberto: number;
    emEspera: number;
    emProgresso: number;
    concluidas: number;
    canceladas: number;
    total: number;
  };
  detalhe: Record<string, DetalheOS[]>;  // keyed by status code "A","F","E","C"
  source: "db";
  generatedAt: string;
}


// ── Helpers ───────────────────────────────────────────────────────────────────
const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function weekStartLabel(ano: number, semana: number): string {
  // ISO week start (Monday) approximation via Jan 4 = always in week 1
  const jan4 = new Date(ano, 0, 4);
  const dayOfWeek = jan4.getDay() || 7; // 1=Mon … 7=Sun
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (semana - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(monday.getDate())}/${pad(monday.getMonth() + 1)} - ${pad(sunday.getDate())}/${pad(sunday.getMonth() + 1)}`;
}

function monthLabel(ano: number, mes: number): string {
  return `${MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`;
}

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

// ── DB query ──────────────────────────────────────────────────────────────────
async function queryEngeman(dias: number, agrupamento: "semana" | "mes"): Promise<{
  periodos: PeriodoOS[];
  status: OrdensResponse["status"];
  detalhe: Record<string, DetalheOS[]>;
}> {
  const pool = await sql.connect(await getEngemanConfig());

  // ── 1. Períodos agrupados ────────────────────────────────────────────────
  // Corretivas = CODTIPMAN IN (1,2,3)  → CRT, CRP, CRN
  // Preventivas = CODTIPMAN NOT IN (1,2,3) → tudo que não é corretivo
  // Concluídas = STATORD = 'F'
  const groupCol = agrupamento === "semana"
    ? "DATEPART(WEEK, o.DATENT)"
    : "MONTH(o.DATENT)";

  const periodResult = await pool.request()
    .input("diasPeriodo", sql.Int, dias)
    .query<{
      ANO: number;
      PERIODO: number;
      CRIADAS: number;
      CONCLUIDAS: number;
      PREVENTIVAS: number;
      CORRETIVAS: number;
    }>(`
      SELECT
        YEAR(o.DATENT)     AS ANO,
        ${groupCol}        AS PERIODO,
        COUNT(*)           AS CRIADAS,
        SUM(CASE WHEN ISNULL(o.STATORD, 'A') = 'F' THEN 1 ELSE 0 END) AS CONCLUIDAS,
        SUM(CASE WHEN o.CODTIPMAN NOT IN (1,2,3) AND o.CODTIPMAN IS NOT NULL THEN 1 ELSE 0 END) AS PREVENTIVAS,
        SUM(CASE WHEN o.CODTIPMAN IN (1,2,3) THEN 1 ELSE 0 END) AS CORRETIVAS
      FROM ORDSERV o
      WHERE o.DATENT >= DATEADD(DAY, -@diasPeriodo, GETDATE())
      GROUP BY YEAR(o.DATENT), ${groupCol}
      ORDER BY ANO, PERIODO
    `);

  // ── 2. Totais por status ─────────────────────────────────────────────────
  const statusResult = await pool.request()
    .input("diasPeriodo2", sql.Int, dias)
    .query<{ STATORD: string | null; TOTAL: number }>(`
      SELECT
        ISNULL(STATORD, 'A') AS STATORD,
        COUNT(*)             AS TOTAL
      FROM ORDSERV
      WHERE DATENT >= DATEADD(DAY, -@diasPeriodo2, GETDATE())
      GROUP BY ISNULL(STATORD, 'A')
    `);

  // ── 3. Detalhe por status (TOP 50 per status) ────────────────────────────
  const detalheResult = await pool.request()
    .input("diasPeriodo3", sql.Int, dias)
    .query<{
      CODORD: number;
      DESCRICAO: string | null;
      LOCAL: string | null;
      EQUIPAMENTO: string | null;
      TIPO: string | null;
      STATORD: string | null;
      PRIOR: string | null;
      DATENT: Date | null;
    }>(`
      SELECT TOP 200
        o.CODORD,
        ISNULL(RTRIM(o.OBS), 'Sem descrição')              AS DESCRICAO,
        ISNULL(RTRIM(l.DESCRICAO), 'Não informado')        AS LOCAL,
        ISNULL(RTRIM(a.DESCRICAO), 'Não informado')        AS EQUIPAMENTO,
        ISNULL(RTRIM(t.DESCRICAO), 'Tipo ' + CAST(ISNULL(o.CODTIPMAN,0) AS VARCHAR)) AS TIPO,
        ISNULL(o.STATORD, 'A')                             AS STATORD,
        CASE o.PRISUB WHEN 1 THEN 'ALTA' WHEN 2 THEN 'MÉDIA' WHEN 3 THEN 'BAIXA' ELSE NULL END AS PRIOR,
        o.DATENT
      FROM ORDSERV o
      LEFT JOIN APLIC    a ON a.CODAPL    = o.CODAPL
      LEFT JOIN LOCAPLIC l ON l.CODLOCAPL = a.CODLOCAPL
      LEFT JOIN TIPMANUT t ON t.CODTIPMAN = o.CODTIPMAN
      WHERE o.DATENT >= DATEADD(DAY, -@diasPeriodo3, GETDATE())
      ORDER BY ISNULL(o.STATORD,'A'), o.DATENT DESC
    `);

  await pool.close();

  // ── Build periodos ───────────────────────────────────────────────────────
  const periodos: PeriodoOS[] = periodResult.recordset.map((r) => ({
    label: agrupamento === "semana"
      ? weekStartLabel(r.ANO, r.PERIODO)
      : monthLabel(r.ANO, r.PERIODO),
    criadas:     r.CRIADAS,
    concluidas:  r.CONCLUIDAS,
    preventivas: r.PREVENTIVAS,
    corretivas:  r.CORRETIVAS,
  }));

  // ── Build status counts ──────────────────────────────────────────────────
  const statusMap: Record<string, number> = {};
  for (const r of statusResult.recordset) {
    statusMap[r.STATORD ?? "A"] = r.TOTAL;
  }
  const status: OrdensResponse["status"] = {
    emAberto:    statusMap["A"] ?? 0,
    emEspera:    statusMap["E"] ?? 0,
    emProgresso: statusMap["P"] ?? 0,
    concluidas:  statusMap["F"] ?? 0,
    canceladas:  statusMap["C"] ?? 0,
    total:       Object.values(statusMap).reduce((a, b) => a + b, 0),
  };

  // ── Build detalhe (group by status, up to 50 per group) ─────────────────
  const detalhe: Record<string, DetalheOS[]> = { A: [], E: [], P: [], F: [], C: [] };
  for (const r of detalheResult.recordset) {
    const code = r.STATORD ?? "A";
    if (!detalhe[code]) detalhe[code] = [];
    if (detalhe[code].length < 50) {
      detalhe[code].push({
        codord:     r.CODORD,
        titulo:     stripRtf(r.DESCRICAO) || "Sem descrição",
        local:      r.LOCAL ?? "Não informado",
        equipamento: r.EQUIPAMENTO ?? "Não informado",
        tipo:       r.TIPO ?? "—",
        statord:    code,
        prioridade: r.PRIOR ?? null,
        datent:     fmtDatetime(r.DATENT),
      });
    }
  }

  return { periodos, status, detalhe };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const params      = req.nextUrl.searchParams;
  const dias        = Math.max(1, parseInt(params.get("dias") ?? "365", 10) || 365);
  const agrupamento = (params.get("agrupamento") === "mes" ? "mes" : "semana") as "semana" | "mes";

  let periodos: PeriodoOS[];
  let status: OrdensResponse["status"];
  let detalhe: Record<string, DetalheOS[]>;

  try {
    const result = await queryEngeman(dias, agrupamento);
    periodos = result.periodos;
    status   = result.status;
    detalhe  = result.detalhe;
  } catch (err) {
    console.error("[PCM /api/pcm/ordens] Engeman inacessível:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Engeman inacessível" }, { status: 503 });
  }

  // ── Derived totals ────────────────────────────────────────────────────────
  const totalCriadas    = periodos.reduce((s, p) => s + p.criadas, 0);
  const totalConcluidas = periodos.reduce((s, p) => s + p.concluidas, 0);
  const totalPreventivas = periodos.reduce((s, p) => s + p.preventivas, 0);
  const totalCorretivas  = periodos.reduce((s, p) => s + p.corretivas, 0);

  const indiceConclusao = totalCriadas > 0
    ? Math.round((totalConcluidas / totalCriadas) * 1000) / 10
    : 0;
  const pctPreventivas = (totalPreventivas + totalCorretivas) > 0
    ? Math.round((totalPreventivas / (totalPreventivas + totalCorretivas)) * 1000) / 10
    : 0;

  // Force status.total to match totalCriadas for display consistency
  status.total = totalCriadas;

  const response: OrdensResponse = {
    periodo:     dias,
    agrupamento,
    totais: {
      criadas:          totalCriadas,
      concluidas:       totalConcluidas,
      indiceConclusao,
    },
    tipoTotais: {
      preventivas:    totalPreventivas,
      corretivas:     totalCorretivas,
      pctPreventivas,
    },
    periodos,
    status,
    detalhe,
    source: "db",
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(response);
}
