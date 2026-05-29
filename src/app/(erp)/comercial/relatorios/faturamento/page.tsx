"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import PageHeader from "@/components/shared/PageHeader";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import StatusBadge from "@/components/shared/StatusBadge";
import { useTabTitle } from "@/lib/tabs-context";
import { formatBRL, cn } from "@/lib/utils";
import { BarChart3, Loader2, ChevronRight, TrendingUp, ShoppingCart, Users } from "lucide-react";

// ── Tipos ───────────────────────────────────────────────────────────────────
type Row = {
  id: string;
  numero: string;
  status: string;
  data: string;        // YYYY-MM-DD
  valor: number;
  clienteId: string;
  clienteNome: string;
};

type DiaAgg     = { key: string; label: string; valor: number; pedidos: number };
type ClienteAgg = { key: string; label: string; valor: number; pedidos: number };

// ── Helpers ─────────────────────────────────────────────────────────────────
function diaLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
function diaLabelLongo(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function defaultRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function ChartTooltip({ active, payload, labelKey }: {
  active?: boolean; payload?: Array<{ payload: { label: string; valor: number; pedidos: number } }>; labelKey?: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm text-xs">
      <div className="font-semibold text-gray-800">{labelKey === "cliente" ? p.label : p.label}</div>
      <div className="text-gray-600 mt-0.5">{formatBRL(p.valor)}</div>
      <div className="text-gray-400">{p.pedidos} pedido{p.pedidos !== 1 ? "s" : ""}</div>
    </div>
  );
}

export default function FaturamentoReportPage() {
  useTabTitle("Faturamento");
  const router = useRouter();

  const [range, setRange] = useState<DateRange>(defaultRange);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // Drill-down
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedCliente, setSelectedCliente] = useState<{ id: string; nome: string } | null>(null);

  const rangeRef = useRef(range);
  useEffect(() => { rangeRef.current = range; }, [range]);

  const load = useCallback(async () => {
    const { from, to } = rangeRef.current;
    if (!from || !to) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/comercial/relatorios/faturamento?from=${from}&to=${to}`);
      const json = await res.json();
      setRows(Array.isArray(json.data) ? json.data : []);
      // reset drill ao recarregar
      setSelectedDay(null);
      setSelectedCliente(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!range.from || !range.to) return;
    load();
  }, [range.from, range.to, load]);

  // ── Agregações ──────────────────────────────────────────────────────────
  const porDia = useMemo<DiaAgg[]>(() => {
    const map = new Map<string, DiaAgg>();
    for (const r of rows) {
      const g = map.get(r.data) ?? { key: r.data, label: diaLabel(r.data), valor: 0, pedidos: 0 };
      g.valor += r.valor; g.pedidos += 1;
      map.set(r.data, g);
    }
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [rows]);

  const rowsDoDia = useMemo(() => rows.filter((r) => r.data === selectedDay), [rows, selectedDay]);

  const porCliente = useMemo<ClienteAgg[]>(() => {
    const map = new Map<string, ClienteAgg>();
    for (const r of rowsDoDia) {
      const g = map.get(r.clienteId) ?? { key: r.clienteId, label: r.clienteNome, valor: 0, pedidos: 0 };
      g.valor += r.valor; g.pedidos += 1;
      map.set(r.clienteId, g);
    }
    return Array.from(map.values()).sort((a, b) => b.valor - a.valor);
  }, [rowsDoDia]);

  const listaPedidos = useMemo(() => {
    const base = selectedCliente ? rowsDoDia.filter((r) => r.clienteId === selectedCliente.id) : rowsDoDia;
    return [...base].sort((a, b) => b.valor - a.valor);
  }, [rowsDoDia, selectedCliente]);

  // ── KPIs do período ───────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.valor, 0);
    const pedidos = rows.length;
    const dias = porDia.length;
    return {
      total,
      pedidos,
      dias,
      ticket: pedidos > 0 ? total / pedidos : 0,
      mediaDia: dias > 0 ? total / dias : 0,
    };
  }, [rows, porDia]);

  // ── Drill handlers ──────────────────────────────────────────────────────
  function handleDiaClick(entry: DiaAgg) {
    if (!entry?.key) return;
    setSelectedDay(entry.key);
    setSelectedCliente(null);
  }
  function handleClienteClick(entry: ClienteAgg) {
    if (!entry?.key) return;
    setSelectedCliente((prev) => (prev?.id === entry.key ? null : { id: entry.key, nome: entry.label }));
  }

  const chartData = selectedDay ? porCliente : porDia;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Faturamento"
        breadcrumbs={[{ label: "Comercial" }, { label: "Relatórios" }, { label: "Faturamento" }]}
      />

      <div className="px-8 pb-8 space-y-6">
        {/* Filtro de período */}
        <div className="flex items-center gap-3 flex-wrap">
          <DateRangePicker value={range} onChange={setRange} />
          <span className="text-xs text-gray-400">Volume faturado por data de emissão (pedidos confirmados, em agendamento e concluídos).</span>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={<TrendingUp className="w-4 h-4" />} label="Total faturado" value={formatBRL(kpis.total)} />
          <KpiCard icon={<ShoppingCart className="w-4 h-4" />} label="Pedidos" value={String(kpis.pedidos)} />
          <KpiCard icon={<BarChart3 className="w-4 h-4" />} label="Ticket médio" value={formatBRL(kpis.ticket)} />
          <KpiCard icon={<BarChart3 className="w-4 h-4" />} label="Média / dia" value={formatBRL(kpis.mediaDia)} />
        </div>

        {/* Gráfico + drill-down */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            {/* Breadcrumb de drill-down */}
            <div className="flex items-center gap-1.5 text-sm">
              <button
                onClick={() => { setSelectedDay(null); setSelectedCliente(null); }}
                className={cn("font-semibold", selectedDay ? "text-blue-600 hover:underline" : "text-gray-800")}
              >
                Por dia
              </button>
              {selectedDay && (
                <>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                  <button
                    onClick={() => setSelectedCliente(null)}
                    className={cn("font-semibold", selectedCliente ? "text-blue-600 hover:underline" : "text-gray-800")}
                  >
                    {diaLabelLongo(selectedDay)}
                  </button>
                </>
              )}
              {selectedCliente && (
                <>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                  <span className="font-semibold text-gray-800">{selectedCliente.nome}</span>
                </>
              )}
            </div>
            <span className="text-xs text-gray-400">
              {selectedDay ? "Por cliente — clique numa barra para filtrar os pedidos" : "Clique numa barra (dia) para detalhar"}
            </span>
          </div>

          <div className="p-5">
            {loading ? (
              <div className="flex items-center justify-center h-[320px] text-gray-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Carregando…</span>
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[320px] text-gray-400 gap-2">
                <BarChart3 className="w-8 h-8 text-gray-300" />
                <p className="text-sm font-medium">Nenhum faturamento no período</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} margin={{ top: 8, right: 12, left: 12, bottom: 5 }} style={{ cursor: "pointer" }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                    angle={selectedDay ? -15 : 0}
                    textAnchor={selectedDay ? "end" : "middle"}
                    height={selectedDay ? 50 : 30}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => (v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v}`)}
                  />
                  <Tooltip content={<ChartTooltip labelKey={selectedDay ? "cliente" : "dia"} />} cursor={{ fill: "#f8fafc" }} />
                  <Bar
                    dataKey="valor"
                    radius={[4, 4, 0, 0]}
                    name="Faturamento"
                    onClick={(entry) =>
                      selectedDay
                        ? handleClienteClick(entry as unknown as ClienteAgg)
                        : handleDiaClick(entry as unknown as DiaAgg)
                    }
                  >
                    {chartData.map((e) => {
                      const isSel = selectedDay ? selectedCliente?.id === e.key : selectedDay === e.key;
                      return <Cell key={e.key} fill={isSel ? "#1d4ed8" : "#3b82f6"} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Lista de pedidos do dia selecionado */}
          {selectedDay && !loading && (
            <div className="border-t border-gray-100">
              <div className="px-5 py-3 flex items-center gap-2 text-sm text-gray-600 bg-gray-50">
                <Users className="w-4 h-4 text-gray-400" />
                Pedidos de {diaLabelLongo(selectedDay)}
                {selectedCliente && <> · <span className="font-medium text-gray-800">{selectedCliente.nome}</span></>}
                <span className="ml-auto text-xs text-gray-400">{listaPedidos.length} pedido{listaPedidos.length !== 1 ? "s" : ""}</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-y border-gray-100 text-xs text-gray-500">
                  <tr>
                    <th className="text-left px-5 py-2 font-medium">Pedido</th>
                    <th className="text-left px-5 py-2 font-medium">Cliente</th>
                    <th className="text-left px-5 py-2 font-medium">Status</th>
                    <th className="text-right px-5 py-2 font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {listaPedidos.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/pedidos-venda/${r.id}`)}
                    >
                      <td className="px-5 py-2.5 font-mono text-xs font-semibold text-gray-900">{r.numero}</td>
                      <td className="px-5 py-2.5 text-gray-700">{r.clienteNome}</td>
                      <td className="px-5 py-2.5"><StatusBadge status={r.status} /></td>
                      <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{formatBRL(r.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
        {icon}{label}
      </div>
      <div className="mt-1.5 text-xl font-bold text-gray-900 tabular-nums">{value}</div>
    </div>
  );
}
