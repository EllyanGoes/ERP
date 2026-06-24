"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock, CheckCircle2, XCircle, BarChart3, TrendingUp, Loader2, RefreshCw,
} from "lucide-react";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/shared/PageHeader";

// ── Types ──────────────────────────────────────────────────────────────────────
type SlaData = {
  summary: { total: number; atendidos: number; naoAtendidos: number; slaPct: number };
  byMonth: { month: string; atendido: number; naoAtendido: number; total: number; pct: number }[];
  byCategoria: { categoria: string; atendido: number; naoAtendido: number; total: number; pct: number }[];
  byFornecedor: { id: string; nome: string; atendido: number; naoAtendido: number; total: number; pct: number }[];
};

// ── Palette ────────────────────────────────────────────────────────────────────
const PIE_COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6",
  "#ef4444", "#06b6d4", "#f97316", "#84cc16",
];

const COLOR_OK  = "#10b981"; // emerald-500
const COLOR_NOK = "#ef4444"; // red-500

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString("pt-BR", {
    month: "short", year: "2-digit",
  });
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground/60 text-sm">
      Sem dados no período
    </div>
  );
}

// ── Grouped Bar Chart ─────────────────────────────────────────────────────────
function GroupedBarChart({
  data,
}: {
  data: { month: string; atendido: number; naoAtendido: number }[];
}) {
  if (data.length === 0) return <EmptyChart />;

  const W = 800, H = 240, PL = 36, PR = 16, PT = 28, PB = 40;
  const iW = W - PL - PR;
  const iH = H - PT - PB;

  const maxVal = Math.max(...data.map((d) => Math.max(d.atendido, d.naoAtendido))) * 1.15 || 1;
  const yOf    = (v: number) => PT + iH - (v / maxVal) * iH;

  const groupW = iW / data.length;
  const gap    = groupW * 0.12;
  const barW   = (groupW - gap * 3) / 2;

  const ySteps = 4;
  const yGrid  = Array.from({ length: ySteps + 1 }, (_, i) => ({
    y:     PT + iH - (i / ySteps) * iH,
    label: Math.round((i / ySteps) * maxVal).toString(),
  }));

  return (
    <div className="space-y-2 h-full flex flex-col">
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground pl-1">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLOR_OK }} />
          Atendido
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLOR_NOK }} />
          Não Atendido
        </span>
      </div>
      <div className="flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
          {/* Y gridlines */}
          {yGrid.map((g, i) => (
            <g key={i}>
              <line x1={PL} y1={g.y} x2={W - PR} y2={g.y} stroke="#f3f4f6" strokeWidth="1" />
              <text x={PL - 4} y={g.y + 4} textAnchor="end" fontSize="9" fill="#9ca3af">
                {g.label}
              </text>
            </g>
          ))}

          {/* Bars */}
          {data.map((d, i) => {
            const groupX   = PL + i * groupW;
            const xOk      = groupX + gap;
            const xNok     = xOk + barW + gap;
            const yOk      = yOf(d.atendido);
            const yNok     = yOf(d.naoAtendido);
            const hOk      = PT + iH - yOk;
            const hNok     = PT + iH - yNok;
            const midGroup = groupX + groupW / 2;

            return (
              <g key={i}>
                {/* Atendido bar */}
                <rect x={xOk} y={yOk} width={barW} height={hOk} fill={COLOR_OK} rx="2" />
                {d.atendido > 0 && (
                  <text x={xOk + barW / 2} y={yOk - 4} textAnchor="middle" fontSize="9" fill="#065f46" fontWeight="600">
                    {d.atendido}
                  </text>
                )}

                {/* Não Atendido bar */}
                <rect x={xNok} y={yNok} width={barW} height={hNok} fill={COLOR_NOK} rx="2" />
                {d.naoAtendido > 0 && (
                  <text x={xNok + barW / 2} y={yNok - 4} textAnchor="middle" fontSize="9" fill="#7f1d1d" fontWeight="600">
                    {d.naoAtendido}
                  </text>
                )}

                {/* X-axis label */}
                <text x={midGroup} y={H - 6} textAnchor="middle" fontSize="9" fill="#9ca3af">
                  {fmtMonth(d.month)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ── Line Chart (SLA %) ─────────────────────────────────────────────────────────
function LineChartSla({ data }: { data: { month: string; pct: number }[] }) {
  if (data.length === 0) return <EmptyChart />;

  const W = 800, H = 220, PL = 44, PR = 20, PT = 28, PB = 40;
  const iW = W - PL - PR, iH = H - PT - PB;

  const xOf = (i: number) => PL + (i / Math.max(data.length - 1, 1)) * iW;
  const yOf = (v: number) => PT + iH - (v / 100) * iH;

  const points = data.map((d, i) => `${xOf(i)},${yOf(d.pct)}`).join(" ");
  const fillPts = [
    `${xOf(0)},${PT + iH}`,
    ...data.map((d, i) => `${xOf(i)},${yOf(d.pct)}`),
    `${xOf(data.length - 1)},${PT + iH}`,
  ].join(" ");

  const ySteps = 5;
  const yGrid  = Array.from({ length: ySteps + 1 }, (_, i) => ({
    y:     PT + iH - (i / ySteps) * iH,
    label: `${Math.round((i / ySteps) * 100)}%`,
  }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      {/* Grid */}
      {yGrid.map((g, i) => (
        <g key={i}>
          <line x1={PL} y1={g.y} x2={W - PR} y2={g.y} stroke="#f3f4f6" strokeWidth="1" />
          <text x={PL - 4} y={g.y + 4} textAnchor="end" fontSize="9" fill="#9ca3af">
            {g.label}
          </text>
        </g>
      ))}

      {/* Area fill */}
      <polygon points={fillPts} fill={COLOR_OK} fillOpacity="0.10" />

      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={COLOR_OK}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Dots + labels */}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={xOf(i)} cy={yOf(d.pct)} r="3.5" fill={COLOR_OK} stroke="white" strokeWidth="1.5" />
          <text
            x={xOf(i)}
            y={yOf(d.pct) - 8}
            textAnchor="middle"
            fontSize="9"
            fill="#065f46"
            fontWeight="600"
          >
            {d.pct.toFixed(1)}%
          </text>
          <text x={xOf(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#9ca3af">
            {fmtMonth(d.month)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── Pie Chart (donut) ─────────────────────────────────────────────────────────
function PieChart({
  data,
}: {
  data: { categoria: string; atendido: number; naoAtendido: number; total: number }[];
}) {
  if (data.length === 0) return <EmptyChart />;

  const totalAll = data.reduce((s, d) => s + d.total, 0) || 1;
  const cx = 50, cy = 50, r = 38, ri = 22;
  let startAngle = -90;

  const slices = data.map((d, i) => {
    const pct      = d.total / totalAll;
    const angle    = pct * 360;
    const endAngle = startAngle + angle;
    const s        = startAngle;
    startAngle     = endAngle;
    return { ...d, startAngle: s, endAngle, color: PIE_COLORS[i % PIE_COLORS.length], pct: pct * 100 };
  });

  function arc(sa: number, ea: number, outerR: number, innerR: number) {
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const x1o = cx + outerR * Math.cos(rad(sa));
    const y1o = cy + outerR * Math.sin(rad(sa));
    const x2o = cx + outerR * Math.cos(rad(ea));
    const y2o = cy + outerR * Math.sin(rad(ea));
    const x1i = cx + innerR * Math.cos(rad(ea));
    const y1i = cy + innerR * Math.sin(rad(ea));
    const x2i = cx + innerR * Math.cos(rad(sa));
    const y2i = cy + innerR * Math.sin(rad(sa));
    const large = ea - sa > 180 ? 1 : 0;
    return `M ${x1o} ${y1o} A ${outerR} ${outerR} 0 ${large} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${innerR} ${innerR} 0 ${large} 0 ${x2i} ${y2i} Z`;
  }

  return (
    <div className="flex items-center gap-6 w-full">
      <svg viewBox="0 0 100 100" className="w-36 h-36 shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={arc(s.startAngle, s.endAngle, r, ri)} fill={s.color} />
        ))}
      </svg>
      <div className="flex-1 space-y-1.5 min-w-0">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-xs text-muted-foreground truncate flex-1">{s.categoria}</span>
            <span className="text-xs font-semibold text-foreground shrink-0">{s.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Horizontal Stacked Bar by Fornecedor ──────────────────────────────────────
function HorizontalStackedBar({
  data,
}: {
  data: { id: string; nome: string; atendido: number; naoAtendido: number; total: number }[];
}) {
  if (data.length === 0) return <EmptyChart />;

  const maxTotal = Math.max(...data.map((d) => d.total)) || 1;

  return (
    <div className="space-y-2.5">
      {data.map((d) => {
        const wOk  = (d.atendido    / maxTotal) * 100;
        const wNok = (d.naoAtendido / maxTotal) * 100;

        return (
          <div key={d.id} className="flex items-center gap-3 min-w-0">
            {/* Name */}
            <span
              className="text-xs text-muted-foreground shrink-0 w-32 truncate"
              title={d.nome}
            >
              {d.nome}
            </span>

            {/* Bar */}
            <div className="flex-1 flex h-5 rounded overflow-hidden bg-muted">
              {d.atendido > 0 && (
                <div
                  className="flex items-center justify-center text-[10px] font-semibold text-white"
                  style={{ width: `${wOk}%`, background: COLOR_OK, minWidth: d.atendido > 0 ? 4 : 0 }}
                >
                  {wOk > 10 ? d.atendido : ""}
                </div>
              )}
              {d.naoAtendido > 0 && (
                <div
                  className="flex items-center justify-center text-[10px] font-semibold text-white"
                  style={{ width: `${wNok}%`, background: COLOR_NOK, minWidth: d.naoAtendido > 0 ? 4 : 0 }}
                >
                  {wNok > 10 ? d.naoAtendido : ""}
                </div>
              )}
            </div>

            {/* Total count */}
            <span className="text-xs font-semibold text-foreground shrink-0 w-8 text-right">
              {d.total}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────────────────────
function SummaryCard({
  label, value, sub, icon, color,
}: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; color: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-4">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", color)}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-lg font-bold text-foreground truncate">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SlaPage() {
  const [range, setRange] = usePersistedState<DateRange>("relatorios:compras:sla:range", () => {
    const to   = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - 12);
    return {
      from: from.toISOString().slice(0, 10),
      to:   to.toISOString().slice(0, 10),
    };
  });

  const [data,    setData]    = useState<SlaData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (range.from) params.set("from", range.from);
    if (range.to)   params.set("to",   range.to);
    fetch(`/api/compras/relatorios/sla?${params}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <PageHeader
          title="SLA"
          subtitle="Nível de serviço: pedidos entregues dentro do prazo"
          breadcrumbs={[
            { label: "Compras" },
            { label: "Relatórios" },
            { label: "SLA" },
          ]}
        />
        <div className="flex items-center gap-2 shrink-0 pt-1">
          <DateRangePicker value={range} onChange={setRange} />
          <button
            onClick={load}
            className="flex items-center justify-center h-9 w-9 border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            title="Atualizar"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/60" />
        </div>
      ) : (
        <>
          {/* ── Summary cards ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              label="Total Pedidos"
              value={(s?.total ?? 0).toLocaleString("pt-BR")}
              sub="excluídos rascunhos e cancelados"
              icon={<BarChart3 className="w-5 h-5 text-info" />}
              color="bg-info/10"
            />
            <SummaryCard
              label="SLA %"
              value={`${(s?.slaPct ?? 0).toFixed(1)}%`}
              sub="pedidos no prazo"
              icon={<TrendingUp className="w-5 h-5 text-success" />}
              color="bg-success/10"
            />
            <SummaryCard
              label="Atendidos"
              value={(s?.atendidos ?? 0).toLocaleString("pt-BR")}
              sub="dentro do prazo"
              icon={<CheckCircle2 className="w-5 h-5 text-success" />}
              color="bg-success/10"
            />
            <SummaryCard
              label="Não Atendidos"
              value={(s?.naoAtendidos ?? 0).toLocaleString("pt-BR")}
              sub="fora do prazo"
              icon={<XCircle className="w-5 h-5 text-red-500" />}
              color="bg-danger/10"
            />
          </div>

          {/* ── Row 2: Grouped Bar + Pie ──────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Grouped Bar Chart */}
            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-sm font-semibold text-foreground mb-4">
                Atendido × Não Atendido por Mês
              </p>
              <div className="h-[260px]">
                <GroupedBarChart data={data?.byMonth ?? []} />
              </div>
            </div>

            {/* Pie by categoria */}
            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-sm font-semibold text-foreground mb-4">
                Pedidos por Categoria
              </p>
              <div className="h-[260px] flex items-center">
                <PieChart data={data?.byCategoria ?? []} />
              </div>
            </div>
          </div>

          {/* ── Row 3: Line Chart + Horizontal Stacked Bar ────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* SLA % over months */}
            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-sm font-semibold text-foreground mb-1">
                SLA % por Mês
              </p>
              <p className="text-xs text-muted-foreground mb-4">Evolução do nível de serviço</p>
              <div className="h-[220px]">
                <LineChartSla data={data?.byMonth ?? []} />
              </div>
            </div>

            {/* Horizontal stacked bar by fornecedor */}
            <div className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-foreground">SLA por Fornecedor</p>
                <span className="text-xs text-muted-foreground">Top 10</span>
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLOR_OK }} />
                  Atendido
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLOR_NOK }} />
                  Não Atendido
                </span>
              </div>
              <HorizontalStackedBar data={data?.byFornecedor ?? []} />
            </div>
          </div>

          {/* ── Empty state ───────────────────────────────────────────── */}
          {(data?.summary.total ?? 0) === 0 && (
            <div className="bg-card rounded-xl border border-border flex flex-col items-center justify-center py-16 gap-3">
              <Clock className="w-8 h-8 text-gray-200" />
              <p className="text-sm text-muted-foreground">
                Nenhum pedido com prazo de entrega encontrado no período selecionado
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
