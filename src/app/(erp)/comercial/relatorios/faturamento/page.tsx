"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts";
import PageHeader from "@/components/shared/PageHeader";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import StatusBadge from "@/components/shared/StatusBadge";
import { useTabTitle } from "@/lib/tabs-context";
import { formatBRL, cn } from "@/lib/utils";
import { BarChart3, Loader2, ChevronRight, TrendingUp, ShoppingCart, Users, Package, X } from "lucide-react";

// ── Tipos ───────────────────────────────────────────────────────────────────
type ItemRow = { itemId: string; codigo: string; descricao: string; valor: number };

type Row = {
  id: string;
  numero: string;
  status: string;
  data: string;        // YYYY-MM-DD
  valor: number;
  clienteId: string;
  clienteNome: string;
  itens: ItemRow[];
};

type DiaAgg     = { key: string; label: string; valor: number; pedidos: number };
type ClienteAgg = { key: string; label: string; valor: number; pedidos: number };

// Agregações do período inteiro (novas seções)
type ClientePareto = {
  id: string; nome: string; valor: number; pedidos: number; pct: number; pctAcumulado: number;
};
type ProdutoLite = { codigo: string; nome: string; valor: number };
type ProdutoFatia = {
  itemId: string; codigo: string; label: string; valor: number; pct: number;
  isOutros?: boolean; produtos?: ProdutoLite[];
};
type PedidoLite = {
  id: string; numero: string; clienteNome: string; status: string; data: string; valor: number;
};
type DrillDown =
  | { kind: "pedidos";  title: string; subtitle: string; pedidos: PedidoLite[] }
  | { kind: "produtos"; title: string; subtitle: string; produtos: ProdutoLite[] };

// Paleta da rosca (mesma do relatório de Spend, para consistência visual)
const PIE_COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6",
  "#ef4444", "#06b6d4", "#f97316", "#84cc16",
];

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
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm text-xs">
      <div className="font-semibold text-foreground">{labelKey === "cliente" ? p.label : p.label}</div>
      <div className="text-muted-foreground mt-0.5">{formatBRL(p.valor)}</div>
      <div className="text-muted-foreground">{p.pedidos} pedido{p.pedidos !== 1 ? "s" : ""}</div>
    </div>
  );
}

export default function FaturamentoReportPage() {
  useTabTitle("Faturamento");
  const router = useRouter();

  const [range, setRange] = useState<DateRange>(defaultRange);
  const [criterio, setCriterio] = useState<"entrega" | "confirmacao">("entrega");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // Drill-down
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedCliente, setSelectedCliente] = useState<{ id: string; nome: string } | null>(null);

  const rangeRef = useRef(range);
  useEffect(() => { rangeRef.current = range; }, [range]);
  const criterioRef = useRef(criterio);
  useEffect(() => { criterioRef.current = criterio; }, [criterio]);

  const load = useCallback(async () => {
    const { from, to } = rangeRef.current;
    if (!from || !to) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/comercial/relatorios/faturamento?from=${from}&to=${to}&criterio=${criterioRef.current}`);
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
  }, [range.from, range.to, criterio, load]);

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

  // ── Novas seções: agregações do período inteiro ────────────────────────────
  const [drill, setDrill] = useState<DrillDown | null>(null);

  // Faturamento por Cliente (ranking / Curva ABC)
  const porClientePareto = useMemo<ClientePareto[]>(() => {
    const map = new Map<string, ClientePareto>();
    for (const r of rows) {
      const g = map.get(r.clienteId) ??
        { id: r.clienteId, nome: r.clienteNome, valor: 0, pedidos: 0, pct: 0, pctAcumulado: 0 };
      g.valor += r.valor; g.pedidos += 1;
      map.set(r.clienteId, g);
    }
    const arr = Array.from(map.values()).sort((a, b) => b.valor - a.valor);
    const total = arr.reduce((s, c) => s + c.valor, 0) || 1;
    let acc = 0;
    for (const c of arr) { c.pct = (c.valor / total) * 100; acc += c.pct; c.pctAcumulado = acc; }
    return arr;
  }, [rows]);

  // Faturamento por Produto (rosca: top 7 + "Outros")
  const porProduto = useMemo<ProdutoFatia[]>(() => {
    const map = new Map<string, { itemId: string; codigo: string; nome: string; valor: number }>();
    for (const r of rows) for (const it of r.itens ?? []) {
      const g = map.get(it.itemId) ??
        { itemId: it.itemId, codigo: it.codigo, nome: it.descricao, valor: 0 };
      g.valor += it.valor;
      map.set(it.itemId, g);
    }
    const arr = Array.from(map.values()).sort((a, b) => b.valor - a.valor);
    const total = arr.reduce((s, p) => s + p.valor, 0) || 1;
    const TOP = 7;
    const fatias: ProdutoFatia[] = arr.slice(0, TOP).map((p) => ({
      itemId: p.itemId, codigo: p.codigo, label: p.nome,
      valor: p.valor, pct: (p.valor / total) * 100,
    }));
    const resto = arr.slice(TOP);
    if (resto.length) {
      const restoValor = resto.reduce((s, p) => s + p.valor, 0);
      fatias.push({
        itemId: "__outros__", codigo: "", label: `Outros (${resto.length})`,
        valor: restoValor, pct: (restoValor / total) * 100, isOutros: true,
        produtos: resto.map((p) => ({ codigo: p.codigo, nome: p.nome, valor: p.valor })),
      });
    }
    return fatias;
  }, [rows]);

  const faturamentoTotal = useMemo(() => rows.reduce((s, r) => s + r.valor, 0), [rows]);

  // Drill-down das novas seções
  function abrirCliente(c: ClientePareto) {
    const pedidos: PedidoLite[] = rows
      .filter((r) => r.clienteId === c.id)
      .map((r) => ({ id: r.id, numero: r.numero, clienteNome: r.clienteNome, status: r.status, data: r.data, valor: r.valor }))
      .sort((a, b) => b.valor - a.valor);
    setDrill({ kind: "pedidos", title: c.nome, subtitle: `${c.pedidos} pedido(s) · ${formatBRL(c.valor)} faturado`, pedidos });
  }
  function abrirProduto(p: ProdutoFatia) {
    if (p.isOutros) {
      setDrill({ kind: "produtos", title: "Outros produtos", subtitle: `${p.produtos?.length ?? 0} produto(s) · ${formatBRL(p.valor)}`, produtos: p.produtos ?? [] });
      return;
    }
    const pedidos: PedidoLite[] = [];
    for (const r of rows) {
      let v = 0;
      for (const it of r.itens ?? []) if (it.itemId === p.itemId) v += it.valor;
      if (v > 0) pedidos.push({ id: r.id, numero: r.numero, clienteNome: r.clienteNome, status: r.status, data: r.data, valor: v });
    }
    pedidos.sort((a, b) => b.valor - a.valor);
    setDrill({ kind: "pedidos", title: p.label, subtitle: `${pedidos.length} pedido(s) · ${formatBRL(p.valor)} faturado`, pedidos });
  }

  const chartData = selectedDay ? porCliente : porDia;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Faturamento"
        breadcrumbs={[{ label: "Faturamento" }, { label: "Relatórios" }, { label: "Faturamento" }]}
      />

      <div className="px-8 pb-8 space-y-6">
        {/* Filtro de período + critério do que conta como faturado */}
        <div className="flex items-center gap-3 flex-wrap">
          <DateRangePicker value={range} onChange={setRange} />
          <div className="inline-flex rounded-lg border border-border overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setCriterio("entrega")}
              className={cn("px-3 py-2 text-sm font-medium", criterio === "entrega" ? "bg-blue-600 text-white" : "bg-card text-muted-foreground hover:bg-muted")}
            >
              Por entrega/conclusão
            </button>
            <button
              type="button"
              onClick={() => setCriterio("confirmacao")}
              className={cn("px-3 py-2 text-sm font-medium border-l border-border", criterio === "confirmacao" ? "bg-blue-600 text-white" : "bg-card text-muted-foreground hover:bg-muted")}
            >
              Por confirmação do pedido
            </button>
          </div>
          <span className="text-xs text-muted-foreground">
            {criterio === "entrega"
              ? "Faturamento realizado: balcão na conclusão e venda agendada a cada entrega (minuta entregue)."
              : "Faturamento por pedido confirmado: confirmados, em agendamento e concluídos, pelo valor total na data de emissão."}
          </span>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={<TrendingUp className="w-4 h-4" />} label="Total faturado" value={formatBRL(kpis.total)} />
          <KpiCard icon={<ShoppingCart className="w-4 h-4" />} label="Pedidos" value={String(kpis.pedidos)} />
          <KpiCard icon={<BarChart3 className="w-4 h-4" />} label="Ticket médio" value={formatBRL(kpis.ticket)} />
          <KpiCard icon={<BarChart3 className="w-4 h-4" />} label="Média / dia" value={formatBRL(kpis.mediaDia)} />
        </div>

        {/* Gráfico + drill-down */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            {/* Breadcrumb de drill-down */}
            <div className="flex items-center gap-1.5 text-sm">
              <button
                onClick={() => { setSelectedDay(null); setSelectedCliente(null); }}
                className={cn("font-semibold", selectedDay ? "text-info hover:underline" : "text-foreground")}
              >
                Por dia
              </button>
              {selectedDay && (
                <>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/60" />
                  <button
                    onClick={() => setSelectedCliente(null)}
                    className={cn("font-semibold", selectedCliente ? "text-info hover:underline" : "text-foreground")}
                  >
                    {diaLabelLongo(selectedDay)}
                  </button>
                </>
              )}
              {selectedCliente && (
                <>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/60" />
                  <span className="font-semibold text-foreground">{selectedCliente.nome}</span>
                </>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {selectedDay ? "Por cliente — clique numa barra para filtrar os pedidos" : "Clique num ponto (dia) para detalhar"}
            </span>
          </div>

          <div className="p-5">
            {loading ? (
              <div className="flex items-center justify-center h-[320px] text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Carregando…</span>
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[320px] text-muted-foreground gap-2">
                <BarChart3 className="w-8 h-8 text-muted-foreground/60" />
                <p className="text-sm font-medium">Nenhum faturamento no período</p>
              </div>
            ) : selectedDay ? (
              // ── Nível cliente (categórico) — barras ──────────────────────
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={porCliente} margin={{ top: 8, right: 12, left: 12, bottom: 5 }} style={{ cursor: "pointer" }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                    angle={-15}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => (v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v}`)}
                  />
                  <Tooltip content={<ChartTooltip labelKey="cliente" />} cursor={{ fill: "#f8fafc" }} />
                  <Bar
                    dataKey="valor"
                    radius={[4, 4, 0, 0]}
                    name="Faturamento"
                    onClick={(entry) => handleClienteClick(entry as unknown as ClienteAgg)}
                  >
                    {porCliente.map((e) => (
                      <Cell key={e.key} fill={selectedCliente?.id === e.key ? "#1d4ed8" : "#3b82f6"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              // ── Nível dia (série temporal) — linha; clique no ponto drilla ─
              <ResponsiveContainer width="100%" height={320}>
                <LineChart
                  data={porDia}
                  margin={{ top: 8, right: 12, left: 12, bottom: 5 }}
                  style={{ cursor: "pointer" }}
                  onClick={(state) => {
                    const idx = (state as { activeTooltipIndex?: number })?.activeTooltipIndex;
                    if (idx != null && porDia[idx]) handleDiaClick(porDia[idx]);
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                    height={30}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => (v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v}`)}
                  />
                  <Tooltip content={<ChartTooltip labelKey="dia" />} cursor={{ stroke: "#cbd5e1", strokeDasharray: "3 3" }} />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    name="Faturamento"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#3b82f6" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Lista de pedidos do dia selecionado */}
          {selectedDay && !loading && (
            <div className="border-t border-border">
              <div className="px-5 py-3 flex items-center gap-2 text-sm text-muted-foreground bg-muted">
                <Users className="w-4 h-4 text-muted-foreground" />
                Pedidos de {diaLabelLongo(selectedDay)}
                {selectedCliente && <> · <span className="font-medium text-foreground">{selectedCliente.nome}</span></>}
                <span className="ml-auto text-xs text-muted-foreground">{listaPedidos.length} pedido{listaPedidos.length !== 1 ? "s" : ""}</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted border-y border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-5 py-2 font-medium">Pedido</th>
                    <th className="text-left px-5 py-2 font-medium">Cliente</th>
                    <th className="text-left px-5 py-2 font-medium">Status</th>
                    <th className="text-right px-5 py-2 font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {listaPedidos.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => router.push(`/pedidos-venda/${r.id}`)}
                    >
                      <td className="px-5 py-2.5 font-mono text-xs font-semibold text-foreground">{r.numero}</td>
                      <td className="px-5 py-2.5 text-foreground">{r.clienteNome}</td>
                      <td className="px-5 py-2.5"><StatusBadge status={r.status} /></td>
                      <td className="px-5 py-2.5 text-right font-semibold text-foreground">{formatBRL(r.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Faturamento por Cliente (ranking / Curva ABC) ──────────────────── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" /> Faturamento por Cliente
            </p>
            <span className="text-xs text-muted-foreground">
              {porClientePareto.length} cliente{porClientePareto.length !== 1 ? "s" : ""} · clique na linha para ver os pedidos
            </span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Carregando…</span>
            </div>
          ) : porClientePareto.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhum faturamento no período selecionado</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">#</th>
                    <th className="text-left px-5 py-3 font-semibold">Cliente</th>
                    <th className="text-right px-5 py-3 font-semibold">Pedidos</th>
                    <th className="text-right px-5 py-3 font-semibold">Total Faturado</th>
                    <th className="text-right px-5 py-3 font-semibold">% Participação</th>
                    <th className="text-right px-5 py-3 font-semibold">% Acumulado</th>
                    <th className="px-5 py-3 w-40" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {porClientePareto.map((c, i) => {
                    const curvaClass = c.pctAcumulado <= 80 ? "bg-blue-500" : c.pctAcumulado <= 95 ? "bg-amber-400" : "bg-rose-400";
                    const curvaLabel = c.pctAcumulado <= 80 ? "A" : c.pctAcumulado <= 95 ? "B" : "C";
                    return (
                      <tr key={c.id} className="hover:bg-muted transition-colors cursor-pointer" onClick={() => abrirCliente(c)}>
                        <td className="px-5 py-3 text-muted-foreground text-xs">{i + 1}</td>
                        <td className="px-5 py-3 font-medium text-foreground">{c.nome}</td>
                        <td className="px-5 py-3 text-right text-muted-foreground">{c.pedidos}</td>
                        <td className="px-5 py-3 text-right font-semibold text-foreground">{formatBRL(c.valor)}</td>
                        <td className="px-5 py-3 text-right text-muted-foreground">{c.pct.toFixed(2)}%</td>
                        <td className="px-5 py-3 text-right font-medium text-foreground">{c.pctAcumulado.toFixed(2)}%</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(c.pct * 5, 100)}%` }} />
                            </div>
                            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded text-white shrink-0", curvaClass)}>{curvaLabel}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-border bg-muted">
                  <tr>
                    <td colSpan={3} className="px-5 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Total</td>
                    <td className="px-5 py-3 text-right font-bold text-foreground">{formatBRL(faturamentoTotal)}</td>
                    <td className="px-5 py-3 text-right font-bold text-muted-foreground">100,00%</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── Faturamento por Produto (rosca) ────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Package className="w-4 h-4 text-muted-foreground" /> Faturamento por Produto
            </p>
            <span className="text-xs text-muted-foreground">Principais produtos · clique para detalhar</span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Carregando…</span>
            </div>
          ) : porProduto.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground/60 text-sm">Sem dados no período</div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="w-44 h-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={porProduto}
                      dataKey="valor"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={74}
                      paddingAngle={1}
                      stroke="none"
                      style={{ cursor: "pointer" }}
                      onClick={(_, i) => abrirProduto(porProduto[i])}
                    >
                      {porProduto.map((e, i) => (
                        <Cell key={e.itemId} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ProdutoTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
                {porProduto.map((p, i) => (
                  <button
                    key={p.itemId}
                    onClick={() => abrirProduto(p)}
                    className="flex items-center gap-2 min-w-0 group text-left"
                    title={p.label}
                  >
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-muted-foreground truncate flex-1 group-hover:text-info transition-colors">{p.label}</span>
                    <span className="text-xs text-muted-foreground shrink-0 tabular-nums">{formatBRL(p.valor)}</span>
                    <span className="text-xs font-semibold text-foreground shrink-0 w-12 text-right tabular-nums">{p.pct.toFixed(1)}%</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drill-down (cliente → pedidos · produto → pedidos / lista) */}
      {drill && <DrillModal data={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

// Tooltip da rosca "por produto"
function ProdutoTooltip({ active, payload }: {
  active?: boolean; payload?: Array<{ payload: ProdutoFatia }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm text-xs">
      <div className="font-semibold text-foreground max-w-[220px] truncate">{p.label}</div>
      <div className="text-muted-foreground mt-0.5">{formatBRL(p.valor)}</div>
      <div className="text-muted-foreground">{p.pct.toFixed(1)}% do faturamento</div>
    </div>
  );
}

// Modal de drill-down reutilizado pelas duas novas seções
function DrillModal({ data, onClose }: { data: DrillDown; onClose: () => void }) {
  const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const totalProdutos = data.kind === "produtos"
    ? (data.produtos.reduce((s, it) => s + it.valor, 0) || 1)
    : 1;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
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

        <div className="overflow-y-auto flex-1">
          {data.kind === "pedidos" && (
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide sticky top-0">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Pedido</th>
                  <th className="text-left px-5 py-3 font-semibold">Cliente</th>
                  <th className="text-right px-5 py-3 font-semibold">Emissão</th>
                  <th className="text-right px-5 py-3 font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.pedidos.map((p) => (
                  <tr
                    key={p.id + p.numero}
                    className="hover:bg-info/10 cursor-pointer transition-colors group"
                    title="Abrir pedido de venda"
                    onClick={() => { onClose(); router.push(`/pedidos-venda/${p.id}`); }}
                  >
                    <td className="px-5 py-3 font-mono text-xs text-info group-hover:underline">{p.numero}</td>
                    <td className="px-5 py-3 text-foreground">{p.clienteNome}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground text-xs">{diaLabelLongo(p.data)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-foreground">{formatBRL(p.valor)}</td>
                  </tr>
                ))}
                {data.pedidos.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-10 text-muted-foreground text-sm">Nenhum pedido encontrado</td></tr>
                )}
              </tbody>
            </table>
          )}

          {data.kind === "produtos" && (
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide sticky top-0">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Código</th>
                  <th className="text-left px-5 py-3 font-semibold">Produto</th>
                  <th className="text-right px-5 py-3 font-semibold">Faturamento</th>
                  <th className="px-5 py-3 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.produtos.map((it, i) => {
                  const pct = (it.valor / totalProdutos) * 100;
                  return (
                    <tr key={i} className="hover:bg-muted">
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{it.codigo || "—"}</td>
                      <td className="px-5 py-3 text-foreground">{it.nome}</td>
                      <td className="px-5 py-3 text-right font-semibold text-foreground">{formatBRL(it.valor)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {data.produtos.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-10 text-muted-foreground text-sm">Nenhum produto encontrado</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {icon}{label}
      </div>
      <div className="mt-1.5 text-xl font-bold text-foreground tabular-nums">{value}</div>
    </div>
  );
}
