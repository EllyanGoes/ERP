"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatDate } from "@/lib/utils";
import { useSession } from "@/lib/session-context";
import { usePersistedFilters } from "@/lib/use-persisted-filters";
import {
  Plus, MoreHorizontal, Loader2, X, BarChart3, Pencil, Trash2,
  LayoutList, Kanban, Search, ArrowUpDown, ChevronDown, Check,
  AlertTriangle,
} from "lucide-react";

// ── Drag & Drop helpers ───────────────────────────────────────────────────────

const COTACAO_NEXT_STATUS: Record<string, string> = {
  PENDENTE:   "EM_ANALISE",
  EM_ANALISE: "CONCLUIDA",
};

function cotacaoDropRoute(id: string, from: string, to: string): string | null {
  if (from === "PENDENTE"   && to === "EM_ANALISE") return `/suprimentos/cotacoes/${id}`;
  if (from === "EM_ANALISE" && to === "CONCLUIDA")  return `/suprimentos/cotacoes/${id}/analise`;
  return null;
}

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

type FilterOp = "is" | "is_not";

const KANBAN_COLS = [
  { status: "PENDENTE",   label: "Pendente",   dot: "bg-amber-400",  color: "bg-amber-50 border-amber-200" },
  { status: "EM_ANALISE", label: "Em Análise", dot: "bg-blue-400",   color: "bg-blue-50 border-blue-200" },
  { status: "CONCLUIDA",  label: "Concluída",  dot: "bg-green-400",  color: "bg-green-50 border-green-200" },
];

const STATUS_OPTIONS = [
  { value: "PENDENTE",   label: "Pendente" },
  { value: "EM_ANALISE", label: "Em Análise" },
  { value: "CONCLUIDA",  label: "Concluída" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDENTE:   { label: "Pendente",   cls: "bg-amber-100 text-amber-700" },
  EM_ANALISE: { label: "Em Análise", cls: "bg-blue-100 text-blue-700" },
  CONCLUIDA:  { label: "Concluída",  cls: "bg-green-100 text-green-700" },
};

const SORT_OPTIONS = [
  { value: "createdAt_desc", label: "Mais recente" },
  { value: "createdAt_asc",  label: "Mais antiga" },
  { value: "numero_asc",     label: "Número ↑" },
  { value: "numero_desc",    label: "Número ↓" },
];

// ── StatusFilterChip ──────────────────────────────────────────────────────────
function StatusFilterChip({
  selected, op, onChange, onOpChange, onClear,
}: {
  selected: string[];
  op: FilterOp;
  onChange: (v: string[]) => void;
  onOpChange: (op: FilterOp) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showOpMenu, setShowOpMenu] = useState(false);
  const [mounted, setMounted] = useState(false);
  const btnRef  = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const opRef   = useRef<HTMLButtonElement>(null);
  const [pos, setPos]   = useState<{ top: number; left: number; width: number } | null>(null);
  const [opPos, setOpPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    function handle(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || dropRef.current?.contains(t)) return;
      setOpen(false); setShowOpMenu(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function calcPos() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) });
  }
  function calcOpPos() {
    if (!opRef.current) return;
    const r = opRef.current.getBoundingClientRect();
    setOpPos({ top: r.bottom + 4, left: r.left });
  }
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const active  = selected.length > 0;
  const opLabel = op === "is" ? "é" : "não é";

  return (
    <div ref={btnRef} className="relative inline-flex items-center">
      <div className={cn(
        "inline-flex items-center h-8 rounded-full border text-sm font-medium transition-colors cursor-pointer select-none",
        active
          ? "border-blue-400 bg-blue-50 text-blue-700"
          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700"
      )}>
        <button
          type="button"
          onClick={() => { calcPos(); setOpen((p) => !p); setShowOpMenu(false); }}
          className="pl-3 pr-1 h-full flex items-center gap-1.5 rounded-l-full"
        >
          <span className={cn("text-xs font-semibold", active ? "text-blue-500" : "text-gray-400")}>Status</span>
          {active && (
            <>
              <button
                ref={opRef}
                type="button"
                onClick={(e) => { e.stopPropagation(); calcOpPos(); setShowOpMenu((p) => !p); setOpen(false); }}
                className="px-1 py-0.5 rounded hover:bg-blue-100 text-blue-600 text-xs font-medium"
              >
                {opLabel}
              </button>
              <span className="text-blue-500 text-xs">
                {selected.length === 1
                  ? STATUS_OPTIONS.find((o) => o.value === selected[0])?.label
                  : `${selected.length} selecionados`}
              </span>
            </>
          )}
          <ChevronDown className={cn("w-3 h-3 ml-0.5 transition-transform", open && "rotate-180", active ? "text-blue-400" : "text-gray-400")} />
        </button>
        {active && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear(); setOpen(false); }}
            className="pr-2 pl-0.5 h-full flex items-center rounded-r-full hover:text-blue-900"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {mounted && showOpMenu && opPos && createPortal(
        <div style={{ position: "fixed", top: opPos.top, left: opPos.left, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[100px]">
          {(["is", "is_not"] as FilterOp[]).map((o) => (
            <button key={o} type="button" onClick={() => { onOpChange(o); setShowOpMenu(false); }}
              className={cn("w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2", op === o && "text-blue-600 font-medium")}>
              {op === o && <Check className="w-3.5 h-3.5 shrink-0" />}
              {o === "is" ? "É" : "Não é"}
            </button>
          ))}
        </div>,
        document.body
      )}

      {mounted && open && pos && createPortal(
        <div ref={dropRef} style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="flex border-b border-gray-100">
            {(["is", "is_not"] as FilterOp[]).map((o) => (
              <button key={o} type="button" onClick={() => onOpChange(o)}
                className={cn("flex-1 py-2 text-xs font-semibold transition-colors", op === o ? "bg-blue-50 text-blue-600" : "text-gray-400 hover:bg-gray-50")}>
                {o === "is" ? "É" : "Não é"}
              </button>
            ))}
          </div>
          <div className="py-1">
            {STATUS_OPTIONS.map((opt) => {
              const checked = selected.includes(opt.value);
              const badge = STATUS_BADGE[opt.value];
              return (
                <button key={opt.value} type="button" onClick={() => toggle(opt.value)}
                  className={cn("w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-left", checked && "bg-blue-50/60")}>
                  <span className={cn("w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors", checked ? "bg-blue-600 border-blue-600" : "border-gray-300")}>
                    {checked && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", badge.cls)}>{badge.label}</span>
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-gray-100 px-3 py-2">
              <button type="button" onClick={() => { onClear(); setOpen(false); }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                Limpar seleção
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── KanbanCard ────────────────────────────────────────────────────────────────
function KanbanCard({ c, onDelete, onClick, canDelete, onDragStart, onDragEnd, isDragging }: {
  c: CotacaoItem;
  onDelete: () => void;
  onClick: () => void;
  canDelete: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const resp = c.fornecedores.filter((f) => f.status === "RESPONDIDA").length;
  const desc = c.fornecedores.filter((f) => f.status === "RECUSADA").length;
  const qtdProdutos = c.fornecedores[0]?.itens.length ?? 0;

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        "bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-grab active:cursor-grabbing group",
        isDragging && "opacity-40 scale-95 rotate-1"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="font-mono text-xs font-bold text-gray-500">{c.numero}</span>
          {c.nome && (
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{c.nome}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
              title="Excluir"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onClick()}>
                <Pencil className="h-4 w-4 mr-2" /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.location.href = `/suprimentos/cotacoes/${c.id}/analise`}>
                <BarChart3 className="h-4 w-4 mr-2" /> Analisar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Meta */}
      <div className="space-y-1 mb-2.5">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{c._count.fornecedores} fornecedor{c._count.fornecedores !== 1 ? "es" : ""}</span>
          {qtdProdutos > 0 && <span>· {qtdProdutos} produto{qtdProdutos !== 1 ? "s" : ""}</span>}
        </div>
        {(resp > 0 || desc > 0) && (
          <div className="flex items-center gap-2 text-xs">
            {resp > 0 && <span className="text-emerald-600 font-medium">{resp} respondida{resp !== 1 ? "s" : ""}</span>}
            {desc > 0 && <span className="text-red-500 font-medium">{desc} descartada{desc !== 1 ? "s" : ""}</span>}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2.5 border-t border-gray-100">
        <span className="text-xs text-gray-300">{formatDate(c.createdAt)}</span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CotacoesPage() {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";

  const [cotacoes, setCotacoes] = useState<CotacaoItem[]>([]);
  const [loading, setLoading]   = useState(true);

  const [f, setF] = usePersistedFilters("cotacoes", {
    search:         "",
    filterStatuses: [] as string[],
    filterStatusOp: "is" as FilterOp,
    sortKey:        "createdAt_desc",
    view:           "list" as "list" | "kanban",
  });
  const { search, filterStatuses, filterStatusOp, sortKey, view } = f;
  const setSearch         = (v: string)            => setF({ search: v });
  const setFilterStatuses = (v: string[])          => setF({ filterStatuses: v });
  const setFilterStatusOp = (v: FilterOp)          => setF({ filterStatusOp: v });
  const setSortKey        = (v: string)            => setF({ sortKey: v });
  const setView           = (v: "list" | "kanban") => setF({ view: v });

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; numero: string } | null>(null);
  const [deleting, setDeleting]         = useState(false);

  // ── Drag state ──────────────────────────────────────────────────────────────
  const [dragItem, setDragItem] = useState<{ id: string; status: string } | null>(null);
  const [overCol,  setOverCol]  = useState<string | null>(null);

  function canDelete(c: CotacaoItem) {
    if (c.status === "CONCLUIDA") return isAdmin;
    return true;
  }

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

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getQtdProdutos(c: CotacaoItem) {
    return c.fornecedores[0]?.itens.length ?? 0;
  }
  function getRespondidas(c: CotacaoItem) {
    return c.fornecedores.filter((f) => f.status === "RESPONDIDA").length;
  }
  function getDescartadas(c: CotacaoItem) {
    return c.fornecedores.filter((f) => f.status === "RECUSADA").length;
  }

  // ── Filtered & sorted ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...cotacoes];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) =>
        c.numero.toLowerCase().includes(q) ||
        (c.nome ?? "").toLowerCase().includes(q)
      );
    }

    if (filterStatuses.length > 0) {
      if (filterStatusOp === "is") {
        list = list.filter((c) => filterStatuses.includes(c.status));
      } else {
        list = list.filter((c) => !filterStatuses.includes(c.status));
      }
    }

    const [field, dir] = sortKey.split("_");
    list.sort((a, b) => {
      const va = field === "createdAt" ? new Date(a.createdAt).getTime() : a.numero;
      const vb = field === "createdAt" ? new Date(b.createdAt).getTime() : b.numero;
      if (va < vb) return dir === "asc" ? -1 : 1;
      if (va > vb) return dir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [cotacoes, search, filterStatuses, filterStatusOp, sortKey]);

  const hasFilters = search || filterStatuses.length > 0;

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

        {/* ── Toolbar ── */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar número ou apelido..."
              className="pl-9 pr-8 h-9 text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status filter chip */}
          <StatusFilterChip
            selected={filterStatuses}
            op={filterStatusOp}
            onChange={setFilterStatuses}
            onOpChange={setFilterStatusOp}
            onClear={() => { setFilterStatuses([]); setFilterStatusOp("is"); }}
          />

          {/* Sort — hidden in kanban */}
          {view === "list" && (
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                className="h-9 px-3 pr-8 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}

          {/* Clear all */}
          {hasFilters && (
            <button
              onClick={() => { setSearch(""); setFilterStatuses([]); setFilterStatusOp("is"); }}
              className="h-8 px-3 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-full hover:bg-gray-50 flex items-center gap-1 transition-colors"
            >
              <X className="w-3 h-3" /> Limpar tudo
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

        {/* ── Content ── */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <p className="text-lg font-medium">{hasFilters ? "Nenhum resultado encontrado" : "Nenhuma cotação registrada"}</p>
            <p className="text-sm mt-1">{hasFilters ? "Tente ajustar os filtros." : "Clique em \"Nova Cotação\" para começar."}</p>
          </div>
        ) : view === "kanban" ? (

          /* ── KANBAN VIEW ── */
          <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 220px)" }}>
            {KANBAN_COLS.map((col) => {
              const colItems   = filtered.filter((c) => c.status === col.status);
              const isOver     = overCol === col.status;
              const canReceive = !!dragItem && COTACAO_NEXT_STATUS[dragItem.status] === col.status;

              return (
                <div
                  key={col.status}
                  className="flex-shrink-0 w-72 flex flex-col"
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = canReceive ? "move" : "none"; }}
                  onDragEnter={(e) => { e.preventDefault(); if (canReceive) setOverCol(col.status); }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragItem && canReceive) {
                      const route = cotacaoDropRoute(dragItem.id, dragItem.status, col.status);
                      if (route) router.push(route);
                    }
                    setDragItem(null);
                    setOverCol(null);
                  }}
                >
                  {/* Column header */}
                  <div className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-xl border mb-3 transition-all",
                    col.color,
                    isOver && canReceive && "ring-2 ring-blue-400 shadow-md"
                  )}>
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full shrink-0", col.dot)} />
                      <span className="text-sm font-semibold text-gray-700">{col.label}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-500 bg-white/70 px-2 py-0.5 rounded-full">
                      {colItems.length}
                    </span>
                  </div>
                  {/* Cards */}
                  <div className={cn(
                    "flex flex-col gap-2.5 flex-1 rounded-xl p-1 -m-1 transition-all",
                    isOver && canReceive && "bg-blue-50/50 outline outline-2 outline-dashed outline-blue-300"
                  )}>
                    {colItems.length === 0 && !isOver ? (
                      <div className="flex-1 flex items-start justify-center pt-8">
                        <p className="text-xs text-gray-300 italic">Nenhuma cotação</p>
                      </div>
                    ) : colItems.length === 0 && isOver ? (
                      <div className="flex-1 flex items-center justify-center py-8">
                        <p className="text-xs text-blue-400 font-medium">Soltar aqui</p>
                      </div>
                    ) : (
                      colItems.map((c) => (
                        <KanbanCard
                          key={c.id}
                          c={c}
                          onDelete={() => setDeleteTarget({ id: c.id, numero: c.numero })}
                          onClick={() => router.push(`/suprimentos/cotacoes/${c.id}`)}
                          canDelete={canDelete(c)}
                          onDragStart={() => setDragItem({ id: c.id, status: c.status })}
                          onDragEnd={() => { setDragItem(null); setOverCol(null); }}
                          isDragging={dragItem?.id === c.id}
                        />
                      ))
                    )}
                    {/* Drop zone hint at bottom when column has cards */}
                    {isOver && canReceive && colItems.length > 0 && (
                      <div className="h-12 rounded-lg border-2 border-dashed border-blue-300 flex items-center justify-center">
                        <p className="text-xs text-blue-400 font-medium">Soltar aqui</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        ) : (

          /* ── LIST VIEW ── */
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Num. Cotação</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Apelido</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Produtos</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Fornecedores</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Respondidas</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Descartadas</th>
                  <th className="px-4 py-3 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => {
                  const badge = STATUS_BADGE[c.status] ?? { label: c.status, cls: "bg-gray-100 text-gray-700" };
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                      onClick={() => router.push(`/suprimentos/cotacoes/${c.id}`)}
                    >
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", badge.cls)}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{c.numero}</td>
                      <td className="px-4 py-3 text-gray-600">{c.nome || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(c.createdAt)}</td>
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
                          <DropdownMenuTrigger asChild>
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
        )}
      </div>

      {/* ── Delete modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Excluir cotação?</p>
                <p className="text-sm text-gray-500 mt-0.5 font-mono">{deleteTarget.numero}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">Esta ação é permanente e não pode ser desfeita.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleting}>
                {deleting ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Excluindo...</> : <><Trash2 className="w-4 h-4 mr-1" />Excluir</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
