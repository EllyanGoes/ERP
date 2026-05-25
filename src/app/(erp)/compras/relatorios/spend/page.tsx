"use client";

import { useState, useEffect, useCallback } from "react";
import { BarChart3, TrendingUp, ShoppingBag, Users, Loader2, RefreshCw } from "lucide-react";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import { cn, formatBRL } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
type SpendData = {
  summary: {
    totalSpend: number;
    totalPedidos: number;
    totalFornecedores: number;
    ticketMedio: number;
  };
  byMonth:      { month: string; valor: number; pedidos: number }[];
  byCategoria:  { categoria: string; valor: number; pct: number }[];
  byFornecedor: { id: string; nome: string; valor: number; pedidos: number; pct: number; pctAcumulado: number }[];
};

// ── Chart colours ─────────────────────────────────────────────────────────────
const PIE_COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6",
  "#ef4444", "#06b6d4", "#f97316", "#84cc16",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function fmtMi(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)} Mi`;
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(0)} K`;
  return formatBRL(v);
}

// ── SVG Line Chart ─────────────────────────────────────────────────────────────
function LineChart({ data }: { data: { month: string; valor: number }[] }) {
  if (data.length === 0) return <EmptyChart />;

  const W = 800, H = 200, PL = 50, PR = 20, PT = 20, PB = 40;
  const iW = W - PL - PR, iH = H - PT - PB;

  const maxV = Math.max(...data.map((d) => d.valor)) * 1.1 || 1;
  const xOf  = (i: number) => PL + (i / Math.max(data.length - 1, 1)) * iW;
  const yOf  = (v: number) => PT + iH - (v / maxV) * iH;

  const points = data.map((d, i) => `${xOf(i)},${yOf(d.valor)}`).join(" ");
  const fillPts = [
    `${xOf(0)},${PT + iH}`,
    ...data.map((d, i) => `${xOf(i)},${yOf(d.valor)}`),
    `${xOf(data.length - 1)},${PT + iH}`,
  ].join(" ");

  // Y grid labels
  const ySteps = 4;
  const yGrid = Array.from({ length: ySteps + 1 }, (_, i) => ({
    y: PT + iH - (i / ySteps) * iH,
    label: fmtMi((i / ySteps) * maxV),
  }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      {/* Grid lines */}
      {yGrid.map((g, i) => (
        <g key={i}>
          <line x1={PL} y1={g.y} x2={W - PR} y2={g.y} stroke="#f0f0f0" strokeWidth="1" />
          <text x={PL - 6} y={g.y + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{g.label}</text>
        </g>
      ))}

      {/* Area fill */}
      <polygon points={fillPts} fill="#3b82f6" fillOpacity="0.08" />

      {/* Line */}
      <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* Points + tooltips */}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={xOf(i)} cy={yOf(d.valor)} r="3.5" fill="#3b82f6" stroke="white" strokeWidth="1.5" />
          {/* Label above point */}
          <text x={xOf(i)} y={yOf(d.valor) - 8} textAnchor="middle" fontSize="8" fill="#374151" fontWeight="500">
            {fmtMi(d.valor)}
          </text>
          {/* X-axis label */}
          <text x={xOf(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#9ca3af">
            {fmtMonth(d.month)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── SVG Pie Chart ──────────────────────────────────────────────────────────────
function PieChart({ data }: { data: { categoria: string; valor: number; pct: number }[] }) {
  if (data.length === 0) return <EmptyChart />;

  const cx = 50, cy = 50, r = 38, ri = 20; // donut
  let startAngle = -90;

  const slices = data.map((d, i) => {
    const angle = (d.pct / 100) * 360;
    const endAngle = startAngle + angle;
    const s = startAngle;
    startAngle = endAngle;
    return { ...d, startAngle: s, endAngle, color: PIE_COLORS[i % PIE_COLORS.length] };
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
    const large = (ea - sa) > 180 ? 1 : 0;
    return `M ${x1o} ${y1o} A ${outerR} ${outerR} 0 ${large} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${innerR} ${innerR} 0 ${large} 0 ${x2i} ${y2i} Z`;
  }

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="w-40 h-40 shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={arc(s.startAngle, s.endAngle, r, ri)} fill={s.color} />
        ))}
      </svg>
      <div className="flex-1 space-y-1.5 min-w-0">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-xs text-gray-600 truncate flex-1">{s.categoria}</span>
            <span className="text-xs font-semibold text-gray-800 shrink-0">{s.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-full text-gray-300 text-sm">
      Sem dados no período
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, icon, color }: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", color)}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className="text-lg font-bold text-gray-900 truncate">{value}</p>
        {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SpendPage() {
  const [range, setRange] = useState<DateRange>(() => {
    const to   = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - 12);
    return {
      from: from.toISOString().slice(0, 10),
      to:   to.toISOString().slice(0, 10),
    };
  });

  const [data,    setData]    = useState<SpendData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (range.from) params.set("from", range.from);
    if (range.to)   params.set("to",   range.to);
    fetch(`/api/compras/relatorios/spend?${params}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <span>Compras</span>
            <span>›</span>
            <span>Relatórios</span>
            <span>›</span>
            <span className="text-gray-600 font-medium">SPEND</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Spend Analysis</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gastos em pedidos de compra por fornecedor, categoria e período</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DateRangePicker value={range} onChange={setRange} />
          <button
            onClick={load}
            className="flex items-center justify-center h-9 w-9 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
            title="Atualizar"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : (
        <>
          {/* ── Summary cards ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              label="Total Spend"
              value={fmtMi(s?.totalSpend ?? 0)}
              icon={<BarChart3 className="w-5 h-5 text-amber-600" />}
              color="bg-amber-50"
            />
            <SummaryCard
              label="Pedidos de Compra"
              value={(s?.totalPedidos ?? 0).toLocaleString("pt-BR")}
              sub="excluídos rascunhos e cancelados"
              icon={<ShoppingBag className="w-5 h-5 text-blue-600" />}
              color="bg-blue-50"
            />
            <SummaryCard
              label="Fornecedores"
              value={(s?.totalFornecedores ?? 0).toLocaleString("pt-BR")}
              icon={<Users className="w-5 h-5 text-emerald-600" />}
              color="bg-emerald-50"
            />
            <SummaryCard
              label="Ticket Médio / PC"
              value={formatBRL(s?.ticketMedio ?? 0)}
              icon={<TrendingUp className="w-5 h-5 text-violet-600" />}
              color="bg-violet-50"
            />
          </div>

          {/* ── Charts row ────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Spend por Mês */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-700 mb-4">Spend por Mês</p>
              <div className="h-[200px]">
                <LineChart data={data?.byMonth ?? []} />
              </div>
            </div>

            {/* Spend por Categoria */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-700 mb-4">Spend por Categoria</p>
              <PieChart data={data?.byCategoria ?? []} />
            </div>
          </div>

          {/* ── Pareto Fornecedores ───────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Spend por Fornecedor</p>
              <span className="text-xs text-gray-400">{data?.byFornecedor.length ?? 0} fornecedores</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">#</th>
                    <th className="text-left px-5 py-3 font-semibold">Fornecedor</th>
                    <th className="text-right px-5 py-3 font-semibold">Pedidos</th>
                    <th className="text-right px-5 py-3 font-semibold">Total Gasto</th>
                    <th className="text-right px-5 py-3 font-semibold">% Participação</th>
                    <th className="text-right px-5 py-3 font-semibold">% Acumulado</th>
                    <th className="px-5 py-3 w-40" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data?.byFornecedor ?? []).map((f, i) => {
                    const curvaClass =
                      f.pctAcumulado <= 80 ? "bg-blue-500" :
                      f.pctAcumulado <= 95 ? "bg-amber-400" : "bg-rose-400";
                    const curvaLabel =
                      f.pctAcumulado <= 80 ? "A" :
                      f.pctAcumulado <= 95 ? "B" : "C";

                    return (
                      <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-5 py-3 font-medium text-gray-800">{f.nome}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{f.pedidos}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">
                          {formatBRL(f.valor)}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-600">
                          {f.pct.toFixed(2)}%
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-gray-700">
                          {f.pctAcumulado.toFixed(2)}%
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {/* Pareto bar */}
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${Math.min(f.pct * 5, 100)}%` }}
                              />
                            </div>
                            <span className={cn(
                              "text-[10px] font-bold px-1.5 py-0.5 rounded text-white shrink-0",
                              curvaClass
                            )}>
                              {curvaLabel}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {(data?.byFornecedor.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                        Nenhum pedido encontrado no período selecionado
                      </td>
                    </tr>
                  )}
                </tbody>
                {(data?.byFornecedor.length ?? 0) > 0 && (
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                    <tr>
                      <td colSpan={3} className="px-5 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Total</td>
                      <td className="px-5 py-3 text-right font-bold text-gray-900">
                        {fmtMi(s?.totalSpend ?? 0)}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-gray-600">100,00%</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
