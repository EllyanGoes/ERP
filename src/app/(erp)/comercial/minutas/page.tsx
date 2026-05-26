"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, X, LayoutList, Kanban, CalendarDays, Truck } from "lucide-react";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedFilters } from "@/lib/use-persisted-filters";
import { cn } from "@/lib/utils";

type Minuta = {
  id: string;
  numero: string;
  status: "PENDENTE" | "SAIU_PARA_ENTREGA" | "ENTREGUE" | "CANCELADA";
  dataEmissao: string;
  dataEntrega: string | null;
  motorista: string | null;
  placa: string | null;
  pedidoVenda: {
    id: string;
    numero: string;
    cliente: { razaoSocial: string; nomeFantasia: string | null };
  };
  localEstoque: { id: string; nome: string } | null;
  itens: { id: string }[];
};

const STATUS_LABEL: Record<Minuta["status"], string> = {
  PENDENTE:          "Pendente",
  SAIU_PARA_ENTREGA: "Saiu p/ Entrega",
  ENTREGUE:          "Entregue",
  CANCELADA:         "Cancelada",
};

const STATUS_COLOR: Record<Minuta["status"], string> = {
  PENDENTE:          "bg-amber-100 text-amber-700 border border-amber-200",
  SAIU_PARA_ENTREGA: "bg-blue-100 text-blue-700 border border-blue-200",
  ENTREGUE:          "bg-emerald-100 text-emerald-700 border border-emerald-200",
  CANCELADA:         "bg-gray-100 text-gray-500 border border-gray-200",
};

const KANBAN_COLS: { status: Minuta["status"]; label: string; dot: string; color: string }[] = [
  { status: "PENDENTE",          label: "Pendente",        dot: "bg-amber-400",   color: "bg-amber-50 border-amber-200" },
  { status: "SAIU_PARA_ENTREGA", label: "Saiu p/ Entrega", dot: "bg-blue-500",    color: "bg-blue-50 border-blue-200" },
  { status: "ENTREGUE",          label: "Entregue",        dot: "bg-emerald-500", color: "bg-emerald-50 border-emerald-200" },
  { status: "CANCELADA",         label: "Cancelada",       dot: "bg-gray-400",    color: "bg-gray-50 border-gray-200" },
];

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR");
}

// ── KanbanCard ────────────────────────────────────────────────────────────────
function MinutaKanbanCard({ m, onClick }: { m: Minuta; onClick: () => void }) {
  const cliente = m.pedidoVenda.cliente;
  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="font-mono text-xs font-bold text-gray-500">{m.numero}</span>
        <span className="font-mono text-xs text-gray-400">{m.pedidoVenda.numero}</span>
      </div>
      <p className="text-sm font-medium text-gray-800 leading-tight mb-2.5 line-clamp-2">
        {cliente.nomeFantasia || cliente.razaoSocial}
      </p>
      {(m.motorista || m.placa) && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
          <Truck className="w-3 h-3 shrink-0" />
          <span className="truncate">
            {m.motorista}
            {m.placa && <span className="text-gray-400"> · {m.placa}</span>}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between pt-2.5 border-t border-gray-100">
        <span className="text-xs text-gray-400">{m.itens.length} item{m.itens.length !== 1 ? "s" : ""}</span>
        {m.dataEntrega && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            {fmtDate(m.dataEntrega)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MinutasPage() {
  useTabTitle("Minutas");
  const router = useRouter();

  const [minutas, setMinutas] = useState<Minuta[]>([]);
  const [loading, setLoading] = useState(true);

  const [f, setF] = usePersistedFilters("minutas", {
    search:         "",
    filterStatuses: [] as string[],
    view:           "list" as "list" | "kanban",
    dateFrom:       "",
    dateTo:         "",
  });
  const { search, filterStatuses, view, dateFrom, dateTo } = f;
  const setSearch         = (v: string)            => setF({ search: v });
  const setFilterStatuses = (v: string[])          => setF({ filterStatuses: v });
  const setView           = (v: "list" | "kanban") => setF({ view: v });
  const setDateFrom       = (v: string)            => setF({ dateFrom: v });
  const setDateTo         = (v: string)            => setF({ dateTo: v });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/comercial/minutas");
      const json = await res.json();
      setMinutas(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() =>
    minutas.reduce((acc, m) => { acc[m.status] = (acc[m.status] ?? 0) + 1; return acc; }, {} as Record<string, number>),
    [minutas]
  );

  const filtered = useMemo(() => {
    let list = minutas;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m => {
        const cliente = m.pedidoVenda.cliente;
        const nome = (cliente.nomeFantasia || cliente.razaoSocial).toLowerCase();
        return (
          m.numero.toLowerCase().includes(q) ||
          m.pedidoVenda.numero.toLowerCase().includes(q) ||
          nome.includes(q) ||
          (m.motorista ?? "").toLowerCase().includes(q)
        );
      });
    }

    if (filterStatuses.length > 0) {
      list = list.filter(m => filterStatuses.includes(m.status));
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      list = list.filter(m => new Date(m.dataEmissao) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + "T23:59:59");
      list = list.filter(m => new Date(m.dataEmissao) <= to);
    }

    return list;
  }, [minutas, search, filterStatuses, dateFrom, dateTo]);

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
    <div className="px-8 pb-8 space-y-5">
      <PageHeader
        title="Minutas"
        action={
          <Button size="sm" onClick={() => router.push("/comercial/minutas/nova")} className="gap-1.5 font-semibold">
            <Plus className="w-4 h-4" /> Nova Minuta
          </Button>
        }
      />

      {/* Stats bar */}
      <div className="inline-flex items-stretch rounded-xl border border-gray-200 bg-white shadow-sm divide-x divide-gray-200 overflow-hidden">
        {(["PENDENTE", "SAIU_PARA_ENTREGA", "ENTREGUE", "CANCELADA"] as const).map(s => (
          <button
            key={s}
            onClick={() => toggleStatus(s)}
            className={cn(
              "px-5 py-3 text-center transition-colors hover:bg-gray-50 min-w-[90px]",
              filterStatuses.includes(s) && "bg-gray-100"
            )}
          >
            <div className="text-xl font-bold text-gray-800">{counts[s] ?? 0}</div>
            <div className="text-xs text-gray-500 font-medium whitespace-nowrap">{STATUS_LABEL[s]}</div>
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
            placeholder="Número, pedido, cliente..."
            className="pl-9 h-9 w-56 border-gray-200 text-sm"
          />
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-1">
          {(["PENDENTE", "SAIU_PARA_ENTREGA", "ENTREGUE", "CANCELADA"] as const).map(s => (
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
          <p className="text-lg font-medium">{hasFilters ? "Nenhum resultado encontrado" : "Nenhuma minuta registrada"}</p>
          <p className="text-sm mt-1">{hasFilters ? "Tente ajustar os filtros." : 'Clique em "Nova Minuta" para começar.'}</p>
        </div>

      /* ── KANBAN VIEW ── */
      ) : view === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 300px)" }}>
          {KANBAN_COLS.map(col => {
            const colItems = filtered.filter(m => m.status === col.status);
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
                      <p className="text-xs text-gray-300 italic">Nenhuma minuta</p>
                    </div>
                  ) : colItems.map(m => (
                    <MinutaKanbanCard
                      key={m.id}
                      m={m}
                      onClick={() => router.push(`/comercial/minutas/${m.id}`)}
                    />
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
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Minuta</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Pedido</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Cliente</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Status</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Emissão</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Entrega</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Motorista / Placa</th>
                <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-xs text-gray-500">Itens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(m => (
                <tr
                  key={m.id}
                  onClick={() => router.push(`/comercial/minutas/${m.id}`)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono font-semibold text-gray-800">{m.numero}</td>
                  <td className="px-4 py-3 font-mono text-gray-600">{m.pedidoVenda.numero}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {m.pedidoVenda.cliente.nomeFantasia || m.pedidoVenda.cliente.razaoSocial}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold", STATUS_COLOR[m.status])}>
                      {STATUS_LABEL[m.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{fmtDate(m.dataEmissao) ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtDate(m.dataEntrega) ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.motorista
                      ? <>{m.motorista}{m.placa && <span className="text-gray-400"> · {m.placa}</span>}</>
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{m.itens.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
