export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";

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
  source: "db" | "mock";
  generatedAt: string;
}

// ── DB config ─────────────────────────────────────────────────────────────────
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
  const pool = await sql.connect(dbConfig);

  // ── 1. Períodos agrupados ────────────────────────────────────────────────
  // Corretivas = CODTIPMAN IN (1,2,3), Preventivas = CODTIPMAN >= 4
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
        SUM(CASE WHEN o.CODTIPMAN >= 4 THEN 1 ELSE 0 END) AS PREVENTIVAS,
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
        ISNULL(RTRIM(o.DESCRICAO), 'Sem descrição')        AS DESCRICAO,
        ISNULL(RTRIM(l.DESCRICAO), 'Não informado')        AS LOCAL,
        ISNULL(RTRIM(a.DESCRICAO), 'Não informado')        AS EQUIPAMENTO,
        ISNULL(RTRIM(t.DESCRICAO), 'Tipo ' + CAST(ISNULL(o.CODTIPMAN,0) AS VARCHAR)) AS TIPO,
        ISNULL(o.STATORD, 'A')                             AS STATORD,
        o.PRIOR,
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
        titulo:     r.DESCRICAO ?? "Sem descrição",
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

// ── Mock (fallback) ───────────────────────────────────────────────────────────
function mockData(dias: number, agrupamento: "semana" | "mes"): {
  periodos: PeriodoOS[];
  status: OrdensResponse["status"];
  detalhe: Record<string, DetalheOS[]>;
} {
  const now = new Date();
  const periodos: PeriodoOS[] = [];

  if (agrupamento === "mes") {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const criadas     = Math.floor(30 + Math.random() * 40);
      const concluidas  = Math.floor(criadas * (0.55 + Math.random() * 0.3));
      const preventivas = Math.floor(criadas * (0.4 + Math.random() * 0.2));
      const corretivas  = criadas - preventivas;
      periodos.push({
        label:       monthLabel(d.getFullYear(), d.getMonth() + 1),
        criadas,
        concluidas,
        preventivas,
        corretivas,
      });
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now);
      start.setDate(now.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const pad = (n: number) => String(n).padStart(2, "0");
      const label = `${pad(start.getDate())}/${pad(start.getMonth() + 1)} - ${pad(end.getDate())}/${pad(end.getMonth() + 1)}`;
      const criadas     = Math.floor(8 + Math.random() * 12);
      const concluidas  = Math.floor(criadas * (0.55 + Math.random() * 0.3));
      const preventivas = Math.floor(criadas * (0.4 + Math.random() * 0.2));
      const corretivas  = criadas - preventivas;
      periodos.push({ label, criadas, concluidas, preventivas, corretivas });
    }
  }

  const status = {
    emAberto:    Math.floor(15 + Math.random() * 10),
    emEspera:    Math.floor(5  + Math.random() * 5),
    emProgresso: Math.floor(8  + Math.random() * 8),
    concluidas:  Math.floor(40 + Math.random() * 30),
    canceladas:  Math.floor(2  + Math.random() * 4),
    total:       0,
  };
  status.total = status.emAberto + status.emEspera + status.emProgresso + status.concluidas + status.canceladas;

  const tipos = ["Corretiva", "Preventiva", "Preditiva", "Inspeção", "Lubrificação"];
  const equipamentos = ["LAMINADOR 01", "MAROMBA 01", "EXTRUSOR 02", "BRITADOR 01", "COMPRESSOR 01", "FORNO", "EMPILHADEIRA"];
  const locais = ["LINHA DE PRODUÇÃO 1", "CHAMOTE", "QUEIMA", "ÁREA DE PRODUÇÃO", "FROTA", "ESTUFA 1"];

  function mockOS(statord: string, count: number): DetalheOS[] {
    return Array.from({ length: count }, (_, i) => {
      const datent = new Date(now);
      datent.setDate(now.getDate() - Math.floor(Math.random() * dias));
      return {
        codord:     10000 + Math.floor(Math.random() * 90000),
        titulo:     `${tipos[i % tipos.length]} — ${equipamentos[i % equipamentos.length]}`,
        local:      locais[i % locais.length],
        equipamento: equipamentos[i % equipamentos.length],
        tipo:       tipos[i % tipos.length],
        statord,
        prioridade: ["ALTA","MÉDIA","BAIXA", null][i % 4],
        datent:     fmtDatetime(datent),
      };
    });
  }

  const detalhe: Record<string, DetalheOS[]> = {
    A: mockOS("A", Math.min(status.emAberto,    10)),
    E: mockOS("E", Math.min(status.emEspera,    5)),
    P: mockOS("P", Math.min(status.emProgresso, 8)),
    F: mockOS("F", Math.min(status.concluidas,  10)),
    C: mockOS("C", Math.min(status.canceladas,  4)),
  };

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
  let source: "db" | "mock";

  try {
    const result = await queryEngeman(dias, agrupamento);
    periodos = result.periodos;
    status   = result.status;
    detalhe  = result.detalhe;
    source   = "db";
  } catch (err) {
    console.error("[PCM /api/pcm/ordens] Engeman inacessível, usando mock:", err instanceof Error ? err.message : err);
    const result = mockData(dias, agrupamento);
    periodos = result.periodos;
    status   = result.status;
    detalhe  = result.detalhe;
    source   = "mock";
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
    source,
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(response);
}
