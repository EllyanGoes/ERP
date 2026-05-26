"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Search, X, LayoutList, Kanban,
  ArrowUpDown, CalendarDays,
} from "lucide-react";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedFilters } from "@/lib/use-persisted-filters";
import { cn, formatBRL, formatDate, decimalToNumber } from "@/lib/utils";

type PedidoRow = {
  id: string;
  numero: string;
  status: string;
  dataEmissao: string;
  dataEntrega: string | null;
  valorTotal: unknown;
  cliente: { id: string; razaoSocial: string; nomeFantasia: string | null };
};

const STATUS_LABEL: Record<string, string> = {
  ORCAMENTO:   "Orçamento",
  CONFIRMADO:  "Confirmado",
  EM_PRODUCAO: "Em Produção",
  FATURADO:    "Faturado",
  ENTREGUE:    "Entregue",
  CANCELADO:   "Cancelado",
};

const STATUS_COLOR: Record<string, string> = {
  ORCAMENTO:   "bg-gray-100 text-gray-600 border border-gray-200",
  CONFIRMADO:  "bg-blue-100 text-blue-700 border border-blue-200",
  EM_PRODUCAO: "bg-violet-100 text-violet-700 border border-violet-200",
  FATURADO:    "bg-amber-100 text-amber-700 border border-amber-200",
  ENTREGUE:    "bg-emerald-100 text-emerald-700 border border-emerald-200",
  CANCELADO:   "bg-red-100 text-red-500 border border-red-200",
};

const KANBAN_COLS = [
  { status: "ORCAMENTO",   label: "Orçamento",   dot: "bg-gray-400",   color: "bg-gray-50 border-gray-200" },
  { status: "CONFIRMADO",  label: "Confirmado",  dot: "bg-blue-500",   color: "bg-blue-50 border-blue-200" },
  { status: "EM_PRODUCAO", label: "Em Produção", dot: "bg-violet-500", color: "bg-violet-50 border-violet-200" },
  { status: "FATURADO",    label: "Faturado",    dot: "bg-amber-500",  color: "bg-amber-50 border-amber-200" },
  { status: "ENTREGUE",    label: "Entregue",    dot: "bg-emerald-500",color: "bg-emerald-50 border-emerald-200" },
];

const SORT_OPTIONS = [
  { value: "dataEmissao_desc", label: "Emissão — mais recente" },
  { value: "dataEmissao_asc",  label: "Emissão — mais antigo" },
  { value: "total_desc",       label: "Total — maior" },
  { value: "total_asc",        label: "Total — menor" },
  { value: "numero_asc",       label: "Número — crescente" },
];

const ALL_STATUSES = ["ORCAMENTO", "CONFIRMADO", "EM_PRODUCAO", "FATURADO", "ENTREGUE", "CANCELADO"];

// ── KanbanCard ────────────────────────────────────────────────────────────────
function KanbanCard({ p, onClick }: { p: PedidoRow; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-mono text-xs font-bold text-gray-500">{p.numero}</span>
        <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold shrink-0", STATUS_COLOR[p.status])}>
          {STATUS_LABEL[p.status]}
        </span>
      </div>
      <p className="text-sm font-medium text-gray-800 leading-tight mb-2.5 line-clamp-2">
        {p.cliente.nomeFantasia || p.cliente.razaoSocial}
      </p>
      <div className="flex items-center justify-between pt-2.5 border-t border-gray-100">
        <span className="text-xs font-semibold text-gray-700">{formatBRL(decimalToNumber(p.valorTotal))}</span>
        {p.dataEntrega && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            {new Date(p.dataEntrega).toLocaleDateString("pt-BR")}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PedidosVendaPage() {
  useTabTitle("Pedidos de Venda");
  const router = useRouter();

  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [f, setF] = usePersistedFilters("pedidos-venda", {
    search:          "",
    filterStatuses:  [] as string[],
    sortKey:         "dataEmissao_desc",
    view:            "list" as "list" | "kanban",
    dateFrom:        "",
    dateTo:          "",
  });
  const { search, filterStatuses, sortKey, view, dateFrom, dateTo } = f;
  const setSearch         = (v: string)            => setF({ search: v });
  const setFilterStatuses = (v: string[])          => setF({ filterStatuses: v });
  const setSortKey        = (v: string)            => setF({ sortKey: v });
  const setView           = (v: "list" | "kanban") => setF({ view: v });
  const setDateFrom       = (v: string)            => setF({ dateFrom: v });
  const setDateTo         = (v: string)            => setF({ dateTo: v });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pedidos-venda?limit=500");
      const json = await res.json();
      setPedidos(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() =>
    pedidos.reduce((acc, p) => { acc[p.status] = (acc[p.status] ?? 0) + 1; return acc; }, {} as Record<string, number>),
    [pedidos]
  );

  const filtered = useMemo(() => {
    let list = pedidos;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.numero.toLowerCase().includes(q) ||
        p.cliente.razaoSocial.toLowerCase().includes(q) ||
        (p.cliente.nomeFantasia ?? "").toLowerCase().includes(q)
      );
    }

    if (filterStatuses.length > 0) {
      list = list.filter(p => filterStatuses.includes(p.status));
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      list = list.filter(p => new Date(p.dataEmissao) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + "T23:59:59");
      list = list.filter(p => new Date(p.dataEmissao) <= to);
    }

    // Sort
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "dataEmissao_asc":  return new Date(a.dataEmissao).getTime() - new Date(b.dataEmissao).getTime();
        case "dataEmissao_desc": return new Date(b.dataEmissao).getTime() - new Date(a.dataEmissao).getTime();
        case "total_desc":       return decimalToNumber(b.valorTotal) - decimalToNumber(a.valorTotal);
        case "total_asc":        return decimalToNumber(a.valorTotal) - decimalToNumber(b.valorTotal);
        case "numero_asc":       return a.numero.localeCompare(b.numero);
        default:                 return 0;
      }
    });

    return list;
  }, [pedidos, search, filterStatuses, sortKey, dateFrom, dateTo]);

  const hasFilters = search.trim() !== "" || filterStatuses.length > 0 || dateFrom !== "" || dateTo !== "";

  function clearFilters() {
    setSearch(""); setFilterStatuses([]); setDateFrom(""); setDateTo("");
  }

  function toggleStatus(s: string) {
    setFilterStatuses(
      filterStatuses.includes(s)
        ? filterStatuses.filter(x => x !== s)
        : [...filterStatuses, s]
    );
  }

  return (
    <div>
      <PageHeader
        title="Pedidos de Venda"
        breadcrumbs={[{ label: "Comercial" }, { label: "Pedidos de Venda" }]}
        action={
          <Button asChild>
            <Link href="/pedidos-venda/novo">
              <Plus className="w-4 h-4 mr-2" />
              Novo Pedido
            </Link>
          </Button>
        }
      />

      <div className="px-8 pb-8 space-y-5">

        {/* Stats bar */}
        <div className="inline-flex items-stretch rounded-xl border border-gray-200 bg-white shadow-sm divide-x divide-gray-200 overflow-hidden">
          {Object.entries(STATUS_LABEL).map(([s, label]) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={cn(
                "px-4 py-3 text-center transition-colors hover:bg-gray-50 min-w-[80px]",
                filterStatuses.includes(s) && "bg-gray-100"
              )}
            >
              <div className="text-xl font-bold text-gray-800">{counts[s] ?? 0}</div>
              <div className="text-xs text-gray-500 font-medium whitespace-nowrap">{label}</div>
            </button>
          ))}
        </div>

        {/* Filters toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Número, cliente..."
              className="pl-9 h-9 w-56 border-gray-200 text-sm"
            />
          </div>

          {/* Status chips */}
          <div className="flex items-center gap-1 flex-wrap">
            {ALL_STATUSES.map(s => (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={cn(
                  "h-8 px-3 text-xs font-medium rounded-full border transition-colors",
                  filterStatuses.includes(s)
                    ? STATUS_COLOR[s] + " font-semibold"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50"
                )}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <Input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-9 w-36 border-gray-200 text-sm"
              title="De"
            />
            <span className="text-gray-300 text-sm">—</span>
            <Input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="h-9 w-36 border-gray-200 text-sm"
              title="Até"
            />
          </div>

          {/* Sort — list only */}
          {view === "list" && (
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value)}
                className="h-9 px-3 pr-8 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}

          {/* Clear */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="h-8 px-3 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-full hover:bg-gray-50 flex items-center gap-1 transition-colors"
            >
              <X className="w-3 h-3" /> Limpar
            </button>
          )}

          {/* View toggle */}
          <div className="ml-auto flex items-center gap-0.5 p-0.5 bg-gray-100 rounded-lg border border-gray-200">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                view === "list" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <LayoutList className="w-4 h-4" /> Lista
            </button>
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                view === "kanban" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <Kanban className="w-4 h-4" /> Kanban
            </button>
          </div>
        </div>

        {/* Results count */}
        {!loading && hasFilters && (
          <p className="text-xs text-gray-400">
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
          </p>
        )}

        {/* ── LOADING ── */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <p className="text-lg font-medium">{hasFilters ? "Nenhum resultado encontrado" : "Nenhum pedido registrado"}</p>
            <p className="text-sm mt-1">{hasFilters ? "Tente ajustar os filtros." : 'Clique em "Novo Pedido" para começar.'}</p>
          </div>

        /* ── KANBAN VIEW ── */
        ) : view === "kanban" ? (
          <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 260px)" }}>
            {KANBAN_COLS.map(col => {
              const colItems = filtered.filter(p => p.status === col.status);
              return (
                <div key={col.status} className="flex-shrink-0 w-72 flex flex-col">
                  <div className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-xl border mb-3",
                    col.color
                  )}>
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full shrink-0", col.dot)} />
                      <span className="text-sm font-semibold text-gray-700">{col.label}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-500 bg-white/70 px-2 py-0.5 rounded-full">
                      {colItems.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {colItems.length === 0 ? (
                      <div className="flex items-start justify-center pt-8">
                        <p className="text-xs text-gray-300 italic">Nenhum pedido</p>
                      </div>
                    ) : colItems.map(p => (
                      <KanbanCard key={p.id} p={p} onClick={() => router.push(`/pedidos-venda/${p.id}`)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

        /* ── LIST VIEW ── */
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Número</th>
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Emissão</th>
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Entrega</th>
                  <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-xs text-gray-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(p => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/pedidos-venda/${p.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-gray-800">{p.numero}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{p.cliente.razaoSocial}</div>
                      {p.cliente.nomeFantasia && (
                        <div className="text-xs text-gray-400">{p.cliente.nomeFantasia}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold", STATUS_COLOR[p.status])}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(p.dataEmissao)}</td>
                    <td className="px-4 py-3 text-gray-600">{p.dataEntrega ? formatDate(p.dataEntrega) : "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatBRL(decimalToNumber(p.valorTotal))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
