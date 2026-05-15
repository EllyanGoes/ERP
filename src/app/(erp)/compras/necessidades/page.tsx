"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatusBadge from "@/components/shared/StatusBadge";
import Link from "next/link";
import {
  Plus, Trash2, Loader2, AlertTriangle, ChevronRight, Building2,
  Search, X, ArrowUpDown, ChevronUp, ChevronDown as ChevronDownIcon,
} from "lucide-react";
import { formatDate, cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Necessidade = {
  id: string; numero: string; status: string; prioridade: number;
  solicitante: string | null; justificativa: string | null;
  dataNecessidade: string | null; createdAt: string;
  tipoCompra: string | null; motivo: string | null;
  filial: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  localEstoque: { id: string; nome: string } | null;
  _count: { itens: number };
};

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "RASCUNHO",              label: "Rascunho" },
  { value: "AGUARDANDO_APROVACAO",  label: "Aguardando Aprovação" },
  { value: "APROVADA",              label: "Aprovada" },
  { value: "REPROVADA",             label: "Reprovada" },
  { value: "CANCELADA",             label: "Cancelada" },
  { value: "CONCLUIDA",             label: "Concluída" },
];

const SORT_OPTIONS = [
  { value: "createdAt_desc", label: "Mais recente" },
  { value: "createdAt_asc",  label: "Mais antiga" },
  { value: "numero_asc",     label: "Número ↑" },
  { value: "numero_desc",    label: "Número ↓" },
  { value: "prioridade_desc",label: "Prioridade ↑" },
  { value: "prioridade_asc", label: "Prioridade ↓" },
];

const PRIORIDADE_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: "Muito Baixa", color: "text-gray-400" },
  2: { label: "Baixa",       color: "text-blue-400" },
  3: { label: "Média",       color: "text-amber-500" },
  4: { label: "Alta",        color: "text-orange-500" },
  5: { label: "Crítica",     color: "text-red-600" },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NecessidadesPage() {
  const router = useRouter();
  const [necessidades, setNecessidades] = useState<Necessidade[]>([]);
  const [loading,      setLoading]      = useState(true);

  // Filters & sort
  const [search,     setSearch]     = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFilial, setFilterFilial] = useState("");
  const [sortKey,    setSortKey]    = useState("createdAt_desc");

  // Delete
  const [deleteItem,    setDeleteItem]    = useState<Necessidade | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError,   setDeleteError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/suprimentos/necessidades");
    const json = await res.json();
    setNecessidades(Array.isArray(json.data) ? json.data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function confirmDelete() {
    if (!deleteItem) return;
    setDeleteLoading(true); setDeleteError("");
    const res = await fetch(`/api/suprimentos/necessidades/${deleteItem.id}`, { method: "DELETE" });
    if (!res.ok) {
      setDeleteError((await res.json()).error || "Não foi possível excluir");
      setDeleteLoading(false); return;
    }
    setDeleteItem(null);
    await load();
    setDeleteLoading(false);
  }

  // Unique filials for filter
  const filiais = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of necessidades) {
      if (n.filial) map.set(n.filial.id, n.filial.nomeFantasia || n.filial.razaoSocial);
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [necessidades]);

  // Apply search + filter + sort (client-side)
  const filtered = useMemo(() => {
    let list = [...necessidades];

    // Search: numero, solicitante, justificativa, tipoCompra
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((n) =>
        n.numero.toLowerCase().includes(q) ||
        (n.solicitante?.toLowerCase().includes(q) ?? false) ||
        (n.justificativa?.toLowerCase().includes(q) ?? false) ||
        (n.tipoCompra?.toLowerCase().includes(q) ?? false) ||
        (n.motivo?.toLowerCase().includes(q) ?? false)
      );
    }

    // Status filter
    if (filterStatus) list = list.filter((n) => n.status === filterStatus);

    // Filial filter
    if (filterFilial) list = list.filter((n) => n.filial?.id === filterFilial);

    // Sort
    const [field, dir] = sortKey.split("_");
    list.sort((a, b) => {
      let va: string | number, vb: string | number;
      if (field === "createdAt") {
        va = new Date(a.createdAt).getTime();
        vb = new Date(b.createdAt).getTime();
      } else if (field === "prioridade") {
        va = a.prioridade; vb = b.prioridade;
      } else {
        va = a.numero; vb = b.numero;
      }
      if (va < vb) return dir === "asc" ? -1 : 1;
      if (va > vb) return dir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [necessidades, search, filterStatus, filterFilial, sortKey]);

  // Group filtered list by filial
  type Group = { filialId: string | null; filialLabel: string; items: Necessidade[] };
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const n of filtered) {
      const key   = n.filial?.id ?? "__sem_filial__";
      const label = n.filial ? (n.filial.nomeFantasia || n.filial.razaoSocial) : "Sem Filial";
      if (!map.has(key)) map.set(key, { filialId: key, filialLabel: label, items: [] });
      map.get(key)!.items.push(n);
    }
    return Array.from(map.values());
  }, [filtered]);

  const hasFilters = search || filterStatus || filterFilial;

  return (
    <div>
      <PageHeader
        title="Solicitações de Compras"
        breadcrumbs={[{ label: "Compras" }, { label: "Solicitações" }]}
        action={
          <Button asChild>
            <Link href="/compras/necessidades/nova">
              <Plus className="w-4 h-4 mr-2" />
              Nova Solicitação
            </Link>
          </Button>
        }
      />

      <div className="px-8 pb-8 space-y-4">

        {/* ── Search + Filters + Sort ── */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar número, solicitante, descrição..."
              className="pl-9 pr-8 h-9 text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 px-3 pr-8 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-[170px]"
          >
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {/* Filial filter */}
          {filiais.length > 1 && (
            <select
              value={filterFilial}
              onChange={(e) => setFilterFilial(e.target.value)}
              className="h-9 px-3 pr-8 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-[160px]"
            >
              <option value="">Todas as filiais</option>
              {filiais.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          )}

          {/* Sort */}
          <div className="flex items-center gap-1.5 ml-auto">
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              className="h-9 px-3 pr-8 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={() => { setSearch(""); setFilterStatus(""); setFilterFilial(""); }}
              className="h-9 px-3 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 flex items-center gap-1.5 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Limpar
            </button>
          )}
        </div>

        {/* ── Results count ── */}
        {!loading && hasFilters && (
          <p className="text-xs text-gray-400">
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
          </p>
        )}

        {/* ── Content ── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <p className="text-lg font-medium">{hasFilters ? "Nenhum resultado encontrado" : "Nenhuma solicitação registrada"}</p>
            <p className="text-sm mt-1">{hasFilters ? "Tente ajustar os filtros." : "Clique em \"Nova Solicitação\" para começar."}</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.filialId ?? "sem"}>
              {/* Group header */}
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-blue-500">{group.filialLabel}</span>
                <span className="text-xs text-gray-400">({group.items.length})</span>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-28">Número</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Descrição</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-32">Solicitante</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-36">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-28">
                        <SortHeader label="Prioridade" field="prioridade" current={sortKey} onSort={setSortKey} />
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-32">
                        <SortHeader label="Data" field="createdAt" current={sortKey} onSort={setSortKey} />
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600 w-14">Itens</th>
                      <th className="w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {group.items.map((n) => {
                      const prio = PRIORIDADE_LABEL[n.prioridade];
                      return (
                        <tr
                          key={n.id}
                          className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                          onClick={() => router.push(`/compras/necessidades/${n.id}`)}
                        >
                          <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">
                            <span className="flex items-center gap-1">
                              {n.numero}
                              <ChevronRight className="w-3 h-3 text-gray-300" />
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-gray-800 truncate max-w-xs">{n.justificativa || <span className="text-gray-300 italic">Sem descrição</span>}</p>
                            {n.tipoCompra && <p className="text-xs text-gray-400 mt-0.5">{n.tipoCompra}</p>}
                          </td>
                          <td className="px-4 py-3 text-gray-600 truncate">{n.solicitante || "—"}</td>
                          <td className="px-4 py-3"><StatusBadge status={n.status} /></td>
                          <td className="px-4 py-3">
                            {prio && <span className={cn("text-xs font-semibold", prio.color)}>{n.prioridade} — {prio.label}</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {n.dataNecessidade
                              ? formatDate(n.dataNecessidade)
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-500">{n._count.itens}</td>
                          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => { setDeleteItem(n); setDeleteError(""); }}
                              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete confirm */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Excluir solicitação?</p>
                <p className="text-sm text-gray-500 mt-0.5">{deleteItem.numero}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">Esta ação é permanente e não pode ser desfeita.</p>
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{deleteError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteItem(null)} disabled={deleteLoading}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleteLoading}>
                {deleteLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Excluindo...</> : <><Trash2 className="w-4 h-4 mr-1" />Excluir</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SortHeader ────────────────────────────────────────────────────────────────

function SortHeader({ label, field, current, onSort }: {
  label: string; field: string; current: string; onSort: (v: string) => void;
}) {
  const [curField, curDir] = current.split("_");
  const active = curField === field;

  function toggle() {
    if (!active) { onSort(`${field}_desc`); return; }
    onSort(curDir === "desc" ? `${field}_asc` : `${field}_desc`);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn("flex items-center gap-1 hover:text-gray-800 transition-colors", active ? "text-blue-600" : "text-gray-600")}
    >
      {label}
      {active
        ? curDir === "desc" ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
        : <ArrowUpDown className="w-3 h-3 opacity-40" />}
    </button>
  );
}
