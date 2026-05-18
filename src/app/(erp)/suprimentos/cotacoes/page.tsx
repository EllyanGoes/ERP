"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatDate } from "@/lib/utils";
import { useSession } from "@/lib/session-context";
import { Plus, MoreHorizontal, Loader2, X, BarChart3, Pencil, Trash2, LayoutList, LayoutGrid } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type CotacaoItem = {
  id: string;
  numero: string;
  nome: string | null;
  status: "PENDENTE" | "EM_ANALISE" | "CONCLUIDA";
  createdAt: string;
  _count: { fornecedores: number };
  fornecedores: Array<{
    status: "AGUARDANDO" | "RESPONDIDA" | "RECUSADA";
    itens: Array<{ precoUnitario: unknown }>;
  }>;
};

const COTACAO_KANBAN_COLS = [
  { status: "PENDENTE",   label: "Pendente",   dot: "bg-amber-400",   bg: "bg-amber-50 border-amber-200" },
  { status: "EM_ANALISE", label: "Em Análise", dot: "bg-blue-400",    bg: "bg-blue-50 border-blue-200" },
  { status: "CONCLUIDA",  label: "Concluída",  dot: "bg-green-400",   bg: "bg-green-50 border-green-200" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDENTE:   { label: "Pendente",   cls: "bg-amber-100 text-amber-700" },
  EM_ANALISE: { label: "Em Análise", cls: "bg-blue-100 text-blue-700" },
  CONCLUIDA:  { label: "Concluída",  cls: "bg-green-100 text-green-700" },
};

export default function CotacoesPage() {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";
  const [cotacoes, setCotacoes] = useState<CotacaoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterStatus, setFilterStatus] = useState("TODOS");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "kanban">(() =>
    typeof window !== "undefined"
      ? (localStorage.getItem("cotacoes-view") as "list" | "kanban") ?? "list"
      : "list"
  );

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; numero: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  function canDelete(c: CotacaoItem) {
    if (c.status === "CONCLUIDA") return isAdmin;
    return true;
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/suprimentos/cotacoes");
      const json = await res.json();
      setCotacoes(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Delete ────────────────────────────────────────────────────────────────
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/suprimentos/cotacoes/${deleteTarget.id}`, { method: "DELETE" });
      await load();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = cotacoes.filter((c) => {
    const matchStatus = filterStatus === "TODOS" || c.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      c.numero.toLowerCase().includes(q) ||
      (c.nome ?? "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getQtdProdutos(c: CotacaoItem) {
    if (c.fornecedores.length === 0) return 0;
    return c.fornecedores[0].itens.length;
  }

  function getRespondidas(c: CotacaoItem) {
    return c.fornecedores.filter((f) => f.status === "RESPONDIDA").length;
  }

  function getDescartadas(c: CotacaoItem) {
    return c.fornecedores.filter((f) => f.status === "RECUSADA").length;
  }

  return (
    <div>
      <PageHeader
        title="Cotações de Compra"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Cotações" }]}
        action={
          <Button asChild>
            <Link href="/suprimentos/cotacoes/nova">
              <Plus className="w-4 h-4 mr-2" />
              Nova Cotação
            </Link>
          </Button>
        }
      />

      <div className="px-8 pb-8 space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos</SelectItem>
              <SelectItem value="PENDENTE">Pendente</SelectItem>
              <SelectItem value="EM_ANALISE">Em Análise</SelectItem>
              <SelectItem value="CONCLUIDA">Concluída</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Buscar por número ou apelido..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72"
          />

          <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-white">
            <button
              onClick={() => { setView("list"); localStorage.setItem("cotacoes-view", "list"); }}
              className={cn("p-1.5 rounded-md transition-colors", view === "list" ? "bg-gray-100 text-gray-800" : "text-gray-400 hover:text-gray-600")}
              title="Visualização em lista"
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              onClick={() => { setView("kanban"); localStorage.setItem("cotacoes-view", "kanban"); }}
              className={cn("p-1.5 rounded-md transition-colors", view === "kanban" ? "bg-gray-100 text-gray-800" : "text-gray-400 hover:text-gray-600")}
              title="Visualização em Kanban"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Table / Kanban */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg font-medium">Nenhuma cotação encontrada</p>
            <p className="text-sm mt-1">Tente ajustar os filtros ou clique em &quot;Nova Cotação&quot;.</p>
          </div>
        ) : view === "list" ? (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Num. Cotação</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Apelido Cot.</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Data Receb.</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Qtd. Produto</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Qtd. Fornece.</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Prop. Respondidas</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Prop. Descartadas</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => {
                  const badge = STATUS_BADGE[c.status] ?? { label: c.status, cls: "bg-gray-100 text-gray-700" };
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/suprimentos/cotacoes/${c.id}`)}
                    >
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", badge.cls)}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{c.numero}</td>
                      <td className="px-4 py-3 text-gray-600">{c.nome || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{getQtdProdutos(c)}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{c._count.fornecedores}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-green-700 font-medium">{getRespondidas(c)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-red-600 font-medium">{getDescartadas(c)}</span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/suprimentos/cotacoes/${c.id}`)}>
                              <Pencil className="h-4 w-4 mr-2" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/suprimentos/cotacoes/${c.id}/analise`)}>
                              <BarChart3 className="h-4 w-4 mr-2" /> Analisar
                            </DropdownMenuItem>
                            {canDelete(c) && (
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => setDeleteTarget({ id: c.id, numero: c.numero })}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Excluir
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 pt-2">
            {COTACAO_KANBAN_COLS.map(col => {
              const colItems = filtered.filter(c => c.status === col.status);
              return (
                <div key={col.status} className="flex-shrink-0 w-72 flex flex-col">
                  <div className={cn("rounded-t-lg border-t border-x px-3 py-2 flex items-center gap-2", col.bg)}>
                    <div className={cn("w-2 h-2 rounded-full", col.dot)} />
                    <span className="text-xs font-semibold text-gray-700">{col.label}</span>
                    <span className="ml-auto text-xs text-gray-400">{colItems.length}</span>
                  </div>
                  <div className={cn("flex-1 rounded-b-lg border-b border-x p-2 space-y-2 min-h-24", col.bg)}>
                    {colItems.map(c => {
                      const resp = c.fornecedores.filter(f => f.status === "RESPONDIDA").length;
                      const desc = c.fornecedores.filter(f => f.status === "RECUSADA").length;
                      return (
                        <div
                          key={c.id}
                          className="bg-white rounded-lg border border-gray-100 shadow-sm p-3 cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => router.push(`/suprimentos/cotacoes/${c.id}`)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-bold text-gray-800">{c.numero}</p>
                              {c.nome && <p className="text-xs text-gray-500 mt-0.5 truncate max-w-44">{c.nome}</p>}
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger onClick={e => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={e => { e.stopPropagation(); router.push(`/suprimentos/cotacoes/${c.id}`); }}>
                                  <Pencil className="h-4 w-4 mr-2" /> Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={e => { e.stopPropagation(); router.push(`/suprimentos/cotacoes/${c.id}/analise`); }}>
                                  <BarChart3 className="h-4 w-4 mr-2" /> Analisar
                                </DropdownMenuItem>
                                {canDelete(c) && (
                                  <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={e => { e.stopPropagation(); setDeleteTarget({ id: c.id, numero: c.numero }); }}>
                                    <Trash2 className="h-4 w-4 mr-2" /> Excluir
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                            <span>{c._count.fornecedores} forn.</span>
                            {resp > 0 && <span className="text-green-600">{resp} resp.</span>}
                            {desc > 0 && <span className="text-red-500">{desc} desc.</span>}
                          </div>
                          <p className="text-xs text-gray-300 mt-1">{formatDate(c.createdAt)}</p>
                        </div>
                      );
                    })}
                    {colItems.length === 0 && (
                      <p className="text-xs text-center text-gray-300 py-4">Nenhuma cotação</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !deleting && setDeleteTarget(null)}
          />
          <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <button
              onClick={() => !deleting && setDeleteTarget(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
            <h2 className="font-semibold text-gray-900">Excluir cotação?</h2>
            <p className="text-sm text-gray-600">
              Tem certeza que deseja excluir a cotação{" "}
              <span className="font-mono font-medium">{deleteTarget.numero}</span>?
              Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancelar
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
