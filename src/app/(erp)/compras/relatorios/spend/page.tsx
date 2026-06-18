"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  TrendingUp,
  ShoppingBag,
  Users,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import { cn, formatBRL } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
type PedidoDetail = {
  id: string;
  numero: string;
  fornecedorNome: string;
  valor: number;
  receiptDate: string;
};

type SpendData = {
  summary: {
    totalSpend: number;
    totalPedidos: number;
    totalFornecedores: number;
    ticketMedio: number;
  };
  byMonth: { month: string; valor: number; pedidos: number; pedidosList: PedidoDetail[] }[];
  byCategoria: {
    categoria: string;
    valor: number;
    pct: number;
    subItens: { nome: string; codigo: string; valor: number }[];
  }[];
  byFornecedor: {
    id: string;
    nome: string;
    valor: number;
    pedidos: number;
    pct: number;
    pctAcumulado: number;
    pedidosList: PedidoDetail[];
  }[];
};

type DrillDown = {
  title: string;
  subtitle: string;
  content: "pedidos" | "subItens";
  pedidosList?: PedidoDetail[];
  subItens?: { nome: string; codigo: string; valor: number }[];
};

// ── Chart colours ─────────────────────────────────────────────────────────────
const PIE_COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6",
  "#ef4444", "#06b6d4", "#f97316", "#84cc16",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });
}

function fmtLabel(key: string, groupBy: "month" | "day") {
  if (groupBy === "day") {
    const [, m, d] = key.split("-");
    return `${d}/${m}`;
  }
  return fmtMonth(key);
}

function fmtMi(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)} Mi`;
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(0)} K`;
  return formatBRL(v);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

// ── Empty chart placeholder ───────────────────────────────────────────────────
function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground/60 text-sm">
      Sem dados no período
    </div>
  );
}

// ── Drill-down modal ──────────────────────────────────────────────────────────
function DrillDownModal({
  data,
  onClose,
}: {
  data: DrillDown;
  onClose: () => void;
}) {
  const router = useRouter();
  const totalSubItens =
    data.subItens?.reduce((s, it) => s + it.valor, 0) || 1;

  // ESC fecha o modal (padrão de sistema)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-foreground">{data.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{data.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-muted-foreground transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          {data.content === "pedidos" && (
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide sticky top-0">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Nº Doc.</th>
                  <th className="text-left px-5 py-3 font-semibold">Fornecedor</th>
                  <th className="text-right px-5 py-3 font-semibold">Data Recebimento</th>
                  <th className="text-right px-5 py-3 font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data.pedidosList ?? []).map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-info/10 cursor-pointer transition-colors group"
                    title="Abrir documento de entrada"
                    onClick={() => {
                      onClose();
                      router.push(`/suprimentos/conferencias/${p.id}`);
                    }}
                  >
                    <td className="px-5 py-3 font-mono text-xs text-info group-hover:underline">{p.numero}</td>
                    <td className="px-5 py-3 text-foreground">{p.fornecedorNome}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground text-xs">{fmtDate(p.receiptDate)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-foreground">
                      {formatBRL(p.valor)}
                    </td>
                  </tr>
                ))}
                {(data.pedidosList ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-muted-foreground text-sm">
                      Nenhum documento encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {data.content === "subItens" && (
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide sticky top-0">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Código</th>
                  <th className="text-left px-5 py-3 font-semibold">Item / Produto</th>
                  <th className="text-right px-5 py-3 font-semibold">Total Gasto</th>
                  <th className="px-5 py-3 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data.subItens ?? []).map((it, i) => {
                  const pct = (it.valor / totalSubItens) * 100;
                  return (
                    <tr key={i} className="hover:bg-muted">
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{it.codigo || "—"}</td>
                      <td className="px-5 py-3 text-foreground">{it.nome}</td>
                      <td className="px-5 py-3 text-right font-semibold text-foreground">
                        {formatBRL(it.valor)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(data.subItens ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-muted-foreground text-sm">
                      Nenhum item encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SVG Line Chart ────────────────────────────────────────────────────────────
const LC_W = 560; // viewBox width
const LC_H = 180; // viewBox height
const LC_PAD = { top: 28, right: 16, bottom: 32, left: 52 };

function LineChart({
  data,
  groupBy,
  onPointClick,
}: {
  data: SpendData["byMonth"];
  groupBy: "month" | "day";
  onPointClick: (key: string) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (data.length === 0) return <EmptyChart />;

  const maxV = Math.max(...data.map((d) => d.valor), 1);
  const inner = {
    w: LC_W - LC_PAD.left - LC_PAD.right,
    h: LC_H - LC_PAD.top  - LC_PAD.bottom,
  };

  // Map data points to SVG coordinates
  const pts = data.map((d, i) => ({
    x: LC_PAD.left + (data.length === 1 ? inner.w / 2 : (i / (data.length - 1)) * inner.w),
    y: LC_PAD.top  + inner.h - (d.valor / maxV) * inner.h,
    d,
  }));

  const polyline = pts.map((p) => `${p.x},${p.y}`).join(" ");

  // Area fill (closed path)
  const areaPath = pts.length > 0
    ? `M ${pts[0].x},${LC_PAD.top + inner.h} ` +
      pts.map((p) => `L ${p.x},${p.y}`).join(" ") +
      ` L ${pts[pts.length - 1].x},${LC_PAD.top + inner.h} Z`
    : "";

  // Y-axis tick values (0, 25%, 50%, 75%, 100%)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    y: LC_PAD.top + inner.h - pct * inner.h,
    label: fmtMi(maxV * pct),
  }));

  // X-axis: show at most ~8 labels evenly
  const maxLabels = Math.min(data.length, groupBy === "day" ? 10 : 8);
  const labelStep = data.length <= maxLabels ? 1 : Math.ceil(data.length / maxLabels);
  const xLabelIdxs = new Set(
    Array.from({ length: data.length }, (_, i) => i).filter(
      (i) => i % labelStep === 0 || i === data.length - 1
    )
  );

  return (
    <svg
      viewBox={`0 0 ${LC_W} ${LC_H}`}
      className="w-full select-none"
      style={{ height: LC_H }}
    >
      {/* Y grid lines + labels */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line
            x1={LC_PAD.left} y1={t.y} x2={LC_W - LC_PAD.right} y2={t.y}
            stroke={i === 0 ? "#d1d5db" : "#f3f4f6"} strokeWidth="1"
          />
          <text x={LC_PAD.left - 4} y={t.y + 4} textAnchor="end"
            fontSize="9" fill="#9ca3af">{t.label}
          </text>
        </g>
      ))}

      {/* Area fill */}
      {areaPath && (
        <path d={areaPath} fill="#3b82f6" fillOpacity="0.08" />
      )}

      {/* Line */}
      {pts.length > 1 && (
        <polyline
          points={polyline}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* X-axis labels */}
      {pts.map((p, i) =>
        xLabelIdxs.has(i) ? (
          <text
            key={p.d.month}
            x={p.x} y={LC_PAD.top + inner.h + 14}
            textAnchor="middle" fontSize="9" fill="#9ca3af"
          >
            {fmtLabel(p.d.month, groupBy)}
          </text>
        ) : null
      )}

      {/* Interactive points */}
      {pts.map((p, i) => (
        <g key={p.d.month} style={{ cursor: "pointer" }}
          onClick={() => onPointClick(p.d.month)}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
        >
          {/* Larger invisible hit area */}
          <circle cx={p.x} cy={p.y} r={12} fill="transparent" />

          {/* Visible dot */}
          <circle
            cx={p.x} cy={p.y}
            r={hovered === i ? 5 : 3.5}
            fill={hovered === i ? "#2563eb" : "#3b82f6"}
            stroke="white" strokeWidth="1.5"
            style={{ transition: "r 0.1s" }}
          />

          {/* Tooltip on hover */}
          {hovered === i && (
            <g>
              <rect
                x={Math.min(p.x - 44, LC_W - LC_PAD.right - 88)}
                y={p.y - 32}
                width={88} height={22}
                rx={4} fill="#1e3a5f" fillOpacity="0.92"
              />
              <text
                x={Math.min(p.x, LC_W - LC_PAD.right - 44)}
                y={p.y - 17}
                textAnchor="middle" fontSize="9.5" fill="white" fontWeight="600"
              >
                {fmtMi(p.d.valor)}
              </text>
              <text
                x={Math.min(p.x, LC_W - LC_PAD.right - 44)}
                y={p.y - 7}
                textAnchor="middle" fontSize="8" fill="#93c5fd"
              >
                {p.d.pedidos} pedido{p.d.pedidos !== 1 ? "s" : ""}
              </text>
            </g>
          )}
        </g>
      ))}
    </svg>
  );
}

// ── SVG Donut / Pie Chart ─────────────────────────────────────────────────────
function PieChart({
  data,
  onSliceClick,
}: {
  data: SpendData["byCategoria"];
  onSliceClick: (categoria: string) => void;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (data.length === 0) return <EmptyChart />;

  const cx = 50, cy = 50, r = 38, ri = 20;
  let startAngle = -90;

  const slices = data.map((d, i) => {
    const angle    = (d.pct / 100) * 360;
    const endAngle = startAngle + angle;
    const s        = startAngle;
    startAngle     = endAngle;
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
    const large = ea - sa > 180 ? 1 : 0;
    return `M ${x1o} ${y1o} A ${outerR} ${outerR} 0 ${large} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${innerR} ${innerR} 0 ${large} 0 ${x2i} ${y2i} Z`;
  }

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="w-40 h-40 shrink-0">
        {slices.map((s, i) => (
          <g
            key={i}
            style={{ cursor: "pointer" }}
            onClick={() => onSliceClick(s.categoria)}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <path
              d={arc(s.startAngle, s.endAngle, r, ri)}
              fill={s.color}
              opacity={hoveredIdx === null || hoveredIdx === i ? 1 : 0.65}
              stroke={hoveredIdx === i ? "white" : "none"}
              strokeWidth={hoveredIdx === i ? "2" : "0"}
            />
          </g>
        ))}
      </svg>
      <div className="flex-1 space-y-1.5 min-w-0">
        {slices.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-2 min-w-0 cursor-pointer group"
            onClick={() => onSliceClick(s.categoria)}
          >
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0 transition-opacity"
              style={{ background: s.color }}
            />
            <span className="text-xs text-muted-foreground truncate flex-1 group-hover:text-info transition-colors">
              {s.categoria}
            </span>
            <span className="text-xs font-semibold text-foreground shrink-0">
              {s.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────────────────────
function SummaryCard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-4">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          color
        )}
      >
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

  const [data,      setData]      = useState<SpendData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [drillDown, setDrillDown] = useState<DrillDown | null>(null);
  const [groupBy,   setGroupBy]   = useState<"month" | "day">("month");

  // Keep refs so `load` can always read the latest values without being recreated
  const rangeRef   = useRef(range);
  const groupByRef = useRef(groupBy);
  useEffect(() => { rangeRef.current   = range;   }, [range]);
  useEffect(() => { groupByRef.current = groupBy; }, [groupBy]);

  // Stable load function
  const load = useCallback(() => {
    setLoading(true);
    const { from, to } = rangeRef.current;
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to)   params.set("to",   to);
    params.set("groupBy", groupByRef.current);
    fetch(`/api/compras/relatorios/spend?${params}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load on mount + whenever a COMPLETE range is selected (both dates set)
  useEffect(() => {
    if (!range.from || !range.to) return;
    load();
  }, [range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when groupBy changes (if range is complete)
  useEffect(() => {
    if (!range.from || !range.to) return;
    load();
  }, [groupBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = data?.summary;

  // ── Drill-down handlers ───────────────────────────────────────────────────
  function handleBarClick(month: string) {
    const entry = data?.byMonth.find((m) => m.month === month);
    if (!entry) return;
    const label = fmtLabel(month, groupBy);
    setDrillDown({
      title:    `Documentos — ${label}`,
      subtitle: `${entry.pedidos} documento(s) de entrada em ${label}`,
      content:  "pedidos",
      pedidosList: entry.pedidosList,
    });
  }

  function handleSliceClick(categoria: string) {
    const entry = data?.byCategoria.find((c) => c.categoria === categoria);
    if (!entry) return;
    setDrillDown({
      title:    categoria,
      subtitle: `${entry.subItens.length} produto(s) • ${formatBRL(entry.valor)} total`,
      content:  "subItens",
      subItens: entry.subItens,
    });
  }

  function handleFornecedorClick(fornecedor: SpendData["byFornecedor"][number]) {
    setDrillDown({
      title:    fornecedor.nome,
      subtitle: `${fornecedor.pedidos} documento(s) de entrada • ${formatBRL(fornecedor.valor)} total`,
      content:  "pedidos",
      pedidosList: fornecedor.pedidosList,
    });
  }

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>Compras</span>
            <span>›</span>
            <span>Relatórios</span>
            <span>›</span>
            <span className="text-muted-foreground font-medium">SPEND</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Spend Analysis</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gastos com base nos documentos de entrada (notas fiscais), por fornecedor, categoria e período
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
          {/* ── Summary cards ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              label="Total Spend"
              value={fmtMi(s?.totalSpend ?? 0)}
              icon={<BarChart3 className="w-5 h-5 text-warning" />}
              color="bg-warning/10"
            />
            <SummaryCard
              label="Documentos de Entrada"
              value={(s?.totalPedidos ?? 0).toLocaleString("pt-BR")}
              sub="documentos de entrada lançados"
              icon={<ShoppingBag className="w-5 h-5 text-info" />}
              color="bg-info/10"
            />
            <SummaryCard
              label="Fornecedores"
              value={(s?.totalFornecedores ?? 0).toLocaleString("pt-BR")}
              icon={<Users className="w-5 h-5 text-success" />}
              color="bg-success/10"
            />
            <SummaryCard
              label="Ticket Médio / Doc"
              value={formatBRL(s?.ticketMedio ?? 0)}
              icon={<TrendingUp className="w-5 h-5 text-violet-600" />}
              color="bg-violet-50"
            />
          </div>

          {/* ── Charts row ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Spend por Mês / Dia */}
            <div className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-foreground">Spend por Período</p>
                <div className="flex items-center gap-3">
                  {/* Group by toggle */}
                  <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
                    {(["month", "day"] as const).map((g) => (
                      <button
                        key={g}
                        onClick={() => setGroupBy(g)}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                          groupBy === g
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {g === "month" ? "Mês" : "Dia"}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Clique para ver pedidos</p>
                </div>
              </div>
              <LineChart
                data={data?.byMonth ?? []}
                groupBy={groupBy}
                onPointClick={handleBarClick}
              />
            </div>

            {/* Spend por Categoria */}
            <div className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-foreground">Spend por Categoria</p>
                <p className="text-xs text-muted-foreground">Clique para detalhar</p>
              </div>
              <PieChart
                data={data?.byCategoria ?? []}
                onSliceClick={handleSliceClick}
              />
            </div>
          </div>

          {/* ── Pareto Fornecedores ─────────────────────────────────────────── */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Spend por Fornecedor</p>
              <span className="text-xs text-muted-foreground">
                {data?.byFornecedor.length ?? 0} fornecedores · clique na linha para ver pedidos
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
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
                <tbody className="divide-y divide-border">
                  {(data?.byFornecedor ?? []).map((f, i) => {
                    const curvaClass =
                      f.pctAcumulado <= 80
                        ? "bg-blue-500"
                        : f.pctAcumulado <= 95
                        ? "bg-amber-400"
                        : "bg-rose-400";
                    const curvaLabel =
                      f.pctAcumulado <= 80 ? "A" : f.pctAcumulado <= 95 ? "B" : "C";

                    return (
                      <tr
                        key={f.id}
                        className="hover:bg-muted transition-colors cursor-pointer"
                        onClick={() => handleFornecedorClick(f)}
                      >
                        <td className="px-5 py-3 text-muted-foreground text-xs">{i + 1}</td>
                        <td className="px-5 py-3 font-medium text-foreground">{f.nome}</td>
                        <td className="px-5 py-3 text-right text-muted-foreground">{f.pedidos}</td>
                        <td className="px-5 py-3 text-right font-semibold text-foreground">
                          {formatBRL(f.valor)}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground">
                          {f.pct.toFixed(2)}%
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-foreground">
                          {f.pctAcumulado.toFixed(2)}%
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${Math.min(f.pct * 5, 100)}%` }}
                              />
                            </div>
                            <span
                              className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded text-white shrink-0",
                                curvaClass
                              )}
                            >
                              {curvaLabel}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {(data?.byFornecedor.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                        Nenhum pedido encontrado no período selecionado
                      </td>
                    </tr>
                  )}
                </tbody>
                {(data?.byFornecedor.length ?? 0) > 0 && (
                  <tfoot className="border-t-2 border-border bg-muted">
                    <tr>
                      <td
                        colSpan={3}
                        className="px-5 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide"
                      >
                        Total
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-foreground">
                        {fmtMi(s?.totalSpend ?? 0)}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-muted-foreground">100,00%</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Drill-down modal ─────────────────────────────────────────────────── */}
      {drillDown && (
        <DrillDownModal data={drillDown} onClose={() => setDrillDown(null)} />
      )}
    </div>
  );
}
