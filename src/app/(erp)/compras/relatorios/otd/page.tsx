"use client";

import { useState, useEffect, useCallback } from "react";
import {
  PackageCheck,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Loader2,
  RefreshCw,
} from "lucide-react";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/shared/PageHeader";

// ── Types ──────────────────────────────────────────────────────────────────────
type OtdData = {
  summary: { total: number; atendidos: number; naoAtendidos: number; otdPct: number };
  byMonth: { month: string; atendido: number; naoAtendido: number; total: number; pct: number }[];
  byCategoria: { categoria: string; atendido: number; naoAtendido: number; total: number; pct: number }[];
  byFornecedor: { id: string; nome: string; atendido: number; naoAtendido: number; total: number; pct: number }[];
};

// ── Constants ─────────────────────────────────────────────────────────────────
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

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-full text-gray-300 text-sm">
      Sem dados no período
    </div>
  );
}

// ── Combined Bar + Line Chart ─────────────────────────────────────────────────
function CombinedBarLineChart({
  data,
}: {
  data: { month: string; atendido: number; naoAtendido: number; total: number; pct: number }[];
}) {
  if (data.length === 0) return <EmptyChart />;

  const W = 820, H = 260;
  const PL = 44, PR = 48, PT = 28, PB = 36;
  const iW = W - PL - PR;
  const iH = H - PT - PB;

  const maxCount = Math.max(...data.map((d) => d.total)) * 1.15 || 1;
  const barGroupW = iW / data.length;
  const barPad = barGroupW * 0.18;
  const barW = (barGroupW - barPad * 2) / 2;

  const xBar1 = (i: number) => PL + i * barGroupW + barPad;
  const xBar2 = (i: number) => PL + i * barGroupW + barPad + barW;
  const xMid  = (i: number) => PL + i * barGroupW + barPad + barW; // midpoint of group
  const xLabel = (i: number) => PL + i * barGroupW + barPad + barW; // center label
  const yCount = (v: number) => PT + iH - (v / maxCount) * iH;
  const yPct   = (pct: number) => PT + iH - (pct / 100) * iH;

  const yStepsLeft = 4;
  const yGridLeft = Array.from({ length: yStepsLeft + 1 }, (_, i) => ({
    y:     PT + iH - (i / yStepsLeft) * iH,
    label: Math.round((i / yStepsLeft) * maxCount).toString(),
  }));

  const yStepsRight = 4;
  const yGridRight = Array.from({ length: yStepsRight + 1 }, (_, i) => ({
    y:     PT + iH - (i / yStepsRight) * iH,
    label: `${(i * 100) / yStepsRight}%`,
  }));

  const linePoints = data
    .map((d, i) => `${xMid(i)},${yPct(d.pct)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {yGridLeft.map((g, i) => (
        <g key={i}>
          <line x1={PL} y1={g.y} x2={W - PR} y2={g.y} stroke="#f0f0f0" strokeWidth="1" />
          <text x={PL - 6} y={g.y + 4} textAnchor="end" fontSize="9" fill="#9ca3af">
            {g.label}
          </text>
        </g>
      ))}

      {/* Right axis labels */}
      {yGridRight.map((g, i) => (
        <text key={i} x={W - PR + 6} y={g.y + 4} textAnchor="start" fontSize="9" fill="#60a5fa">
          {g.label}
        </text>
      ))}

      {/* Bars */}
      {data.map((d, i) => {
        const h1 = (d.atendido / maxCount) * iH;
        const h2 = (d.naoAtendido / maxCount) * iH;
        const x1 = xBar1(i);
        const x2 = xBar2(i);

        return (
          <g key={i}>
            {h1 > 0 && (
              <rect
                x={x1}
                y={yCount(d.atendido)}
                width={barW}
                height={h1}
                rx="2"
                fill="#10b981"
                fillOpacity="0.85"
              />
            )}
            {h2 > 0 && (
              <rect
                x={x2}
                y={yCount(d.naoAtendido)}
                width={barW}
                height={h2}
                rx="2"
                fill="#ef4444"
                fillOpacity="0.85"
              />
            )}
            {d.atendido > 0 && (
              <text
                x={x1 + barW / 2}
                y={yCount(d.atendido) - 3}
                textAnchor="middle"
                fontSize="8"
                fill="#059669"
                fontWeight="600"
              >
                {d.atendido}
              </text>
            )}
            {d.naoAtendido > 0 && (
              <text
                x={x2 + barW / 2}
                y={yCount(d.naoAtendido) - 3}
                textAnchor="middle"
                fontSize="8"
                fill="#dc2626"
                fontWeight="600"
              >
                {d.naoAtendido}
              </text>
            )}
            <text
              x={xLabel(i)}
              y={H - 6}
              textAnchor="middle"
              fontSize="9"
              fill="#9ca3af"
            >
              {fmtMonth(d.month)}
            </text>
          </g>
        );
      })}

      {/* OTD % polyline */}
      <polyline
        points={linePoints}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* OTD % dots + labels */}
      {data.map((d, i) => (
        <g key={`pt-${i}`}>
          <circle
            cx={xMid(i)}
            cy={yPct(d.pct)}
            r="3.5"
            fill="#3b82f6"
            stroke="white"
            strokeWidth="1.5"
          />
          <text
            x={xMid(i)}
            y={yPct(d.pct) - 7}
            textAnchor="middle"
            fontSize="8"
            fill="#2563eb"
            fontWeight="600"
          >
            {Math.round(d.pct)}%
          </text>
        </g>
      ))}

      {/* Legend */}
      <g transform={`translate(${PL}, ${PT - 16})`}>
        <circle cx="6" cy="6" r="4" fill="#10b981" />
        <text x="14" y="10" fontSize="9" fill="#374151">Atendido</text>
        <circle cx="72" cy="6" r="4" fill="#ef4444" />
        <text x="80" y="10" fontSize="9" fill="#374151">Não Atendido</text>
        <circle cx="160" cy="6" r="4" fill="#3b82f6" />
        <text x="168" y="10" fontSize="9" fill="#374151">OTD %</text>
      </g>
    </svg>
  );
}

// ── Horizontal Stacked Bar ────────────────────────────────────────────────────
function HorizontalStackedBar({
  data,
}: {
  data: { id: string; nome: string; atendido: number; naoAtendido: number; total: number; pct: number }[];
}) {
  if (data.length === 0) return <EmptyChart />;

  const top7 = data.slice(0, 7);
  const maxTotal = Math.max(...top7.map((d) => d.total)) || 1;
  const BAR_MAX_W = 240;
  const ROW_H = 28;
  const LABEL_W = 120;
  const TOTAL_W = 28;
  const GAP = 6;
  const svgW = LABEL_W + BAR_MAX_W + GAP + TOTAL_W + 8;
  const svgH = top7.length * ROW_H + 4;

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="w-full"
      style={{ height: `${top7.length * 36}px` }}
      preserveAspectRatio="xMidYMid meet"
    >
      {top7.map((d, i) => {
        const y = i * ROW_H + 2;
        const totalBarW = (d.total / maxTotal) * BAR_MAX_W;
        const greenW = totalBarW > 0 ? (d.atendido / d.total) * totalBarW : 0;
        const redW   = totalBarW - greenW;

        return (
          <g key={d.id}>
            <text
              x={LABEL_W - 6}
              y={y + ROW_H / 2 + 4}
              textAnchor="end"
              fontSize="9"
              fill="#374151"
            >
              {d.nome.length > 16 ? d.nome.slice(0, 15) + "…" : d.nome}
            </text>

            {greenW > 0 && (
              <rect
                x={LABEL_W}
                y={y + 6}
                width={greenW}
                height={ROW_H - 12}
                rx="2"
                fill="#10b981"
                fillOpacity="0.85"
              />
            )}
            {greenW >= 16 && (
              <text
                x={LABEL_W + greenW / 2}
                y={y + ROW_H / 2 + 3}
                textAnchor="middle"
                fontSize="8"
                fill="white"
                fontWeight="600"
              >
                {d.atendido}
              </text>
            )}

            {redW > 0 && (
              <rect
                x={LABEL_W + greenW}
                y={y + 6}
                width={redW}
                height={ROW_H - 12}
                rx="2"
                fill="#ef4444"
                fillOpacity="0.85"
              />
            )}
            {redW >= 16 && (
              <text
                x={LABEL_W + greenW + redW / 2}
                y={y + ROW_H / 2 + 3}
                textAnchor="middle"
                fontSize="8"
                fill="white"
                fontWeight="600"
              >
                {d.naoAtendido}
              </text>
            )}

            <text
              x={LABEL_W + BAR_MAX_W + GAP}
              y={y + ROW_H / 2 + 4}
              textAnchor="start"
              fontSize="9"
              fill="#6b7280"
            >
              {d.total}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Pie / Donut Chart ─────────────────────────────────────────────────────────
function PieChart({
  data,
}: {
  data: { categoria: string; atendido: number; naoAtendido: number; total: number; pct: number }[];
}) {
  if (data.length === 0) return <EmptyChart />;

  const cx = 50, cy = 50, r = 38, ri = 20;
  const grandTotal = data.reduce((s, d) => s + d.total, 0) || 1;
  let startAngle = -90;

  const slices = data.map((d, i) => {
    const angle    = (d.total / grandTotal) * 360;
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
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="w-36 h-36 shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={arc(s.startAngle, s.endAngle, r, ri)} fill={s.color} />
        ))}
      </svg>
      <div className="flex-1 space-y-1.5 min-w-0">
        {slices.map((s, i) => {
          const pct = (s.total / grandTotal) * 100;
          return (
            <div key={i} className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: s.color }}
              />
              <span className="text-xs text-gray-600 truncate flex-1">{s.categoria}</span>
              <span className="text-xs text-gray-500 shrink-0">{s.total}</span>
              <span className="text-xs font-semibold text-gray-800 shrink-0 w-10 text-right">
                {pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
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
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          color
        )}
      >
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

// ── Fornecedor Table ──────────────────────────────────────────────────────────
function FornecedorTable({
  data,
}: {
  data: { id: string; nome: string; atendido: number; naoAtendido: number; total: number; pct: number }[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-300 text-sm">
        Sem dados no período
      </div>
    );
  }

  const totalAtendido    = data.reduce((s, d) => s + d.atendido, 0);
  const totalNaoAtendido = data.reduce((s, d) => s + d.naoAtendido, 0);
  const grandTotal       = totalAtendido + totalNaoAtendido;
  const globalOtd        = grandTotal > 0 ? (totalAtendido / grandTotal) * 100 : 0;

  return (
    <div className="overflow-y-auto max-h-64 rounded-lg border border-gray-100">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 sticky top-0 z-10">
          <tr className="border-b border-gray-100">
            <th className="text-left px-3 py-2 font-semibold text-gray-600">Fornecedor</th>
            <th className="text-right px-3 py-2 font-semibold text-emerald-700">Atendido</th>
            <th className="text-right px-3 py-2 font-semibold text-red-600">Não Atend.</th>
            <th className="text-right px-3 py-2 font-semibold text-blue-700">OTD %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.map((f, i) => (
            <tr
              key={f.id}
              className={cn(
                "hover:bg-gray-50 transition-colors",
                i % 2 === 1 && "bg-gray-50/50"
              )}
            >
              <td className="px-3 py-1.5 text-gray-800 font-medium truncate max-w-[160px]">
                {f.nome}
              </td>
              <td className="px-3 py-1.5 text-right">
                <span className="text-emerald-700 font-semibold">{f.atendido}</span>
              </td>
              <td className="px-3 py-1.5 text-right">
                <span className="text-red-600 font-semibold">{f.naoAtendido}</span>
              </td>
              <td className="px-3 py-1.5 text-right">
                <span
                  className={cn(
                    "font-bold",
                    f.pct >= 90
                      ? "text-emerald-600"
                      : f.pct >= 70
                      ? "text-amber-600"
                      : "text-red-600"
                  )}
                >
                  {f.pct.toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-gray-200 bg-gray-100 sticky bottom-0">
          <tr>
            <td className="px-3 py-2 font-bold text-gray-700">Total</td>
            <td className="px-3 py-2 text-right font-bold text-emerald-700">{totalAtendido}</td>
            <td className="px-3 py-2 text-right font-bold text-red-600">{totalNaoAtendido}</td>
            <td className="px-3 py-2 text-right font-bold text-blue-700">
              {globalOtd.toFixed(1)}%
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function OtdPage() {
  const [range, setRange] = useState<DateRange>(() => {
    const to   = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - 12);
    return {
      from: from.toISOString().slice(0, 10),
      to:   to.toISOString().slice(0, 10),
    };
  });

  const [data,    setData]    = useState<OtdData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (range.from) params.set("from", range.from);
    if (range.to)   params.set("to",   range.to);
    fetch(`/api/compras/relatorios/otd?${params}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;

  return (
    <div className="space-y-0">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between px-8 pt-8 pb-4">
        <PageHeader
          title="OTD"
          subtitle="On-Time Delivery: entregas realizadas dentro do prazo acordado"
          breadcrumbs={[
            { label: "Compras" },
            { label: "Relatórios" },
            { label: "OTD" },
          ]}
        />
        <div className="flex items-center gap-2 shrink-0 pt-8">
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

      <div className="px-8 pb-8 space-y-5">
        {loading && !data ? (
          <div className="flex justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : (
          <>
            {/* ── Summary cards ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                label="Total Pedidos"
                value={(s?.total ?? 0).toLocaleString("pt-BR")}
                sub="excluídos rascunhos e cancelados"
                icon={<PackageCheck className="w-5 h-5 text-blue-600" />}
                color="bg-blue-50"
              />
              <SummaryCard
                label="OTD Global"
                value={`${(s?.otdPct ?? 0).toFixed(1)}%`}
                icon={<TrendingUp className="w-5 h-5 text-violet-600" />}
                color="bg-violet-50"
              />
              <SummaryCard
                label="Atendidos"
                value={(s?.atendidos ?? 0).toLocaleString("pt-BR")}
                icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                color="bg-emerald-50"
              />
              <SummaryCard
                label="Não Atendidos"
                value={(s?.naoAtendidos ?? 0).toLocaleString("pt-BR")}
                icon={<XCircle className="w-5 h-5 text-red-500" />}
                color="bg-red-50"
              />
            </div>

            {/* ── Row 2: Combined Chart + Fornecedor Table ────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-1">OTD por Mês</p>
                <p className="text-xs text-gray-400 mb-4">
                  Barras: volume por status · Linha: taxa OTD %
                </p>
                <div className="h-[260px]">
                  <CombinedBarLineChart data={data?.byMonth ?? []} />
                </div>
              </div>

              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-700">Por Fornecedor</p>
                  <span className="text-xs text-gray-400">
                    {data?.byFornecedor.length ?? 0} fornecedores
                  </span>
                </div>
                <div className="flex-1">
                  <FornecedorTable data={data?.byFornecedor ?? []} />
                </div>
              </div>
            </div>

            {/* ── Row 3: Horizontal Stacked Bar + Pie Chart ───────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-1">Top 7 Fornecedores</p>
                <p className="text-xs text-gray-400 mb-3">
                  Volume de pedidos por status de entrega
                </p>
                <div className="flex gap-3 mb-3">
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                    Atendido
                  </span>
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />
                    Não Atendido
                  </span>
                </div>
                <HorizontalStackedBar data={data?.byFornecedor ?? []} />
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-1">Por Categoria</p>
                <p className="text-xs text-gray-400 mb-4">
                  Distribuição de pedidos por tipo de produto
                </p>
                <PieChart data={data?.byCategoria ?? []} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
