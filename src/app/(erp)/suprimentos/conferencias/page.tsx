"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, X, ChevronDown, LayoutList, Kanban, FileText, Calendar, CalendarDays, Building2, MoreHorizontal, Eye, Pencil, Trash2 } from "lucide-react";
import { formatDate, formatBRL, decimalToNumber, cn } from "@/lib/utils";
import { useColumnOrder } from "@/lib/use-column-order";
import { useColumnVisibility } from "@/lib/use-column-visibility";
import ColumnConfigurator, { ColDef } from "@/components/shared/ColumnConfigurator";
import GroupByControl, { GroupByValue } from "@/components/shared/GroupByControl";
import EmpresaTag from "@/components/shared/EmpresaTag";

// ── Types ─────────────────────────────────────────────────────────────────────
type ConferenciaRow = {
  empresaId?: string;
  id: string;
  numero: string;
  numeroNF: string | null;
  status: string;
  dtEmissao: string | null;
  vrTotal: unknown;
  pedido: {
    id: string;
    numero: string;
    fornecedor: { razaoSocial: string; nomeFantasia: string | null } | null;
  } | null;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  itens: Array<{ id: string; vlrTotal: unknown }>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getFornecedorNome(doc: ConferenciaRow): string {
  if (doc.fornecedor) return doc.fornecedor.nomeFantasia || doc.fornecedor.razaoSocial;
  if (doc.pedido?.fornecedor) return doc.pedido.fornecedor.nomeFantasia || doc.pedido.fornecedor.razaoSocial;
  return "—";
}

function calcValorTotal(doc: ConferenciaRow): number {
  const vr = decimalToNumber(doc.vrTotal);
  if (vr > 0) return vr;
  return doc.itens.reduce((s, i) => s + decimalToNumber(i.vlrTotal), 0);
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_COLS: { key: string; label: string; color: string; bg: string; border: string }[] = [
  { key: "PENDENTE",        label: "Pendente",        color: "text-yellow-700", bg: "bg-yellow-50",  border: "border-yellow-200" },
  { key: "EM_CONFERENCIA",  label: "Em Conferência",  color: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-200"   },
  { key: "CONCLUIDA",       label: "Concluída",       color: "text-green-700",  bg: "bg-green-50",   border: "border-green-200"  },
  { key: "DIVERGENCIA",     label: "Divergência",     color: "text-red-600",    bg: "bg-red-50",     border: "border-red-200"    },
];
const ALL_STATUSES = STATUS_COLS.map((s) => s.key);

const FILTER_KEY = "erp:conferencias:filters:v1";
type Filters = { search: string; statuses: string[]; view: "list" | "kanban"; groupBy: GroupByValue };

function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) {
      const f = JSON.parse(raw);
      // Migração: versões antigas guardavam `groupByDate: boolean`.
      const groupBy: GroupByValue =
        f.groupBy === "fornecedor" || f.groupBy === "dia" || f.groupBy === "none"
          ? f.groupBy
          : f.groupByDate === true
          ? "dia"
          : "none";
      return {
        search: f.search ?? "",
        statuses: Array.isArray(f.statuses) ? f.statuses : [...ALL_STATUSES],
        view: f.view ?? "list",
        groupBy,
      };
    }
  } catch { /* ignore */ }
  return { search: "", statuses: [...ALL_STATUSES], view: "list", groupBy: "none" };
}

// ── Column definitions ────────────────────────────────────────────────────────
const COLS: ColDef<ConferenciaRow>[] = [
  {
    id: "numero",
    label: "Nº Doc",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 font-mono text-xs font-medium text-gray-900",
    render: (doc) => doc.numero,
  },
  {
    id: "numeroNF",
    label: "Nº NF",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 font-mono text-xs text-gray-600",
    render: (doc) => doc.numeroNF || "—",
  },
  {
    id: "fornecedor",
    label: "Fornecedor",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-gray-700 max-w-[200px]",
    render: (doc) => <span className="line-clamp-1">{getFornecedorNome(doc)}</span>,
  },
  {
    id: "pedido",
    label: "Pedido",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3",
    render: (doc) => doc.pedido
      ? <span className="font-mono text-xs text-blue-600">{doc.pedido.numero}</span>
      : <span className="text-gray-300 text-xs">—</span>,
  },
  {
    id: "dtEmissao",
    label: "Data Emissão",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-gray-600 text-xs",
    render: (doc) => doc.dtEmissao ? formatDate(doc.dtEmissao) : "—",
  },
  {
    id: "status",
    label: "Status",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3",
    render: (doc) => <StatusBadge status={doc.status} />,
  },
  {
    id: "valorTotal",
    label: "Valor Total",
    thClass: "text-right px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-right text-gray-700",
    render: (doc) => {
      const v = calcValorTotal(doc);
      return v > 0 ? formatBRL(v) : "—";
    },
  },
];

// ── Row Actions Menu ─────────────────────────────────────────────────────────
function RowActionsMenu({ doc, onDeleted }: { doc: ConferenciaRow; onDeleted: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmDelete(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(true);
    try {
      const res = await fetch(`/api/suprimentos/conferencias/${doc.id}`, { method: "DELETE" });
      if (res.ok) {
        setOpen(false);
        onDeleted();
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); setConfirmDelete(false); }}
        className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-50 w-44 bg-white border border-gray-200 rounded-xl shadow-lg py-1 overflow-hidden">
          <button
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={(e) => { e.stopPropagation(); setOpen(false); router.push(`/suprimentos/conferencias/${doc.id}`); }}
          >
            <Eye className="w-3.5 h-3.5 text-gray-400" />
            Abrir
          </button>
          <button
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={(e) => { e.stopPropagation(); setOpen(false); router.push(`/suprimentos/conferencias/${doc.id}`); }}
          >
            <Pencil className="w-3.5 h-3.5 text-gray-400" />
            Editar
          </button>
          <div className="border-t border-gray-100 mt-1 pt-1">
            {!confirmDelete ? (
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir
              </button>
            ) : (
              <div className="px-3 py-2">
                <p className="text-xs text-gray-600 mb-1.5">Confirmar exclusão?</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded px-2 py-1 disabled:opacity-60"
                  >
                    {deleting ? "..." : "Sim"}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                    className="flex-1 text-xs text-gray-600 hover:text-gray-800 border border-gray-200 rounded px-2 py-1"
                  >
                    Não
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Kanban Card ───────────────────────────────────────────────────────────────
function KanbanCard({ doc }: { doc: ConferenciaRow }) {
  const router = useRouter();
  const forn = getFornecedorNome(doc);
  const valor = calcValorTotal(doc);
  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm cursor-pointer hover:shadow-md hover:border-blue-300 transition-all"
      onClick={() => router.push(`/suprimentos/conferencias/${doc.id}`)}
    >
      <span className="font-mono text-xs font-semibold text-gray-800">{doc.numero}</span> <EmpresaTag empresaId={doc.empresaId} />
      {doc.pedido && (
        <p className="text-xs text-blue-600 mt-0.5">{doc.pedido.numero}</p>
      )}
      <p className="text-xs text-gray-700 font-medium mt-1 line-clamp-1">{forn}</p>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
        <span className="text-xs font-semibold text-gray-900">{valor > 0 ? formatBRL(valor) : "—"}</span>
        {doc.dtEmissao && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Calendar className="w-3 h-3" />
            {formatDate(doc.dtEmissao)}
          </span>
        )}
      </div>
      {doc.numeroNF && (
        <p className="text-xs text-gray-400 mt-1">NF {doc.numeroNF}</p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DocumentosEntradaPage() {
  const router = useRouter();
  const [docs, setDocs]       = useState<ConferenciaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/suprimentos/conferencias");
    const json = await res.json();
    setDocs(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Column order
  const [colOrder, setColOrder] = useColumnOrder("conferencias", COLS.map((c) => c.id));
  const [colVis, setColVis, showAllCols] = useColumnVisibility("conferencias", COLS.map((c) => c.id));
  const orderedCols = colOrder.map((id) => COLS.find((c) => c.id === id)).filter((c): c is ColDef<ConferenciaRow> => c !== undefined && colVis[c.id] !== false);

  function updateFilters(partial: Partial<Filters>) {
    setFilters((prev) => {
      const next = { ...prev, ...partial };
      try { localStorage.setItem(FILTER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // Filtering
  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase().trim();
    return docs.filter((doc) => {
      if (!filters.statuses.includes(doc.status)) return false;
      if (!q) return true;
      return (
        doc.numero.toLowerCase().includes(q) ||
        (doc.numeroNF ?? "").toLowerCase().includes(q) ||
        getFornecedorNome(doc).toLowerCase().includes(q) ||
        (doc.pedido?.numero ?? "").toLowerCase().includes(q)
      );
    });
  }, [docs, filters]);

  const activeStatusLabel = useMemo(() => {
    if (filters.statuses.length === ALL_STATUSES.length) return `${filters.statuses.length} status`;
    if (filters.statuses.length === 0) return "Nenhum status";
    if (filters.statuses.length === 1)
      return STATUS_COLS.find((s) => s.key === filters.statuses[0])?.label ?? "1 status";
    return `${filters.statuses.length} status`;
  }, [filters.statuses]);

  const kanbanGroups = useMemo(
    () => STATUS_COLS
      .map((col) => ({ ...col, items: filtered.filter((d) => d.status === col.key) }))
      .filter((col) => filters.statuses.includes(col.key)),
    [filtered, filters.statuses]
  );

  // ── Agrupamento (visão lista): por fornecedor ou por dia ──────────────────
  const groups = useMemo(() => {
    if (filters.groupBy === "none") return null;
    const groups: { key: string; label: string; items: ConferenciaRow[]; total: number }[] = [];
    const index = new Map<string, number>();
    for (const doc of filtered) {
      let key: string;
      let label: string;
      if (filters.groupBy === "fornecedor") {
        const nome = getFornecedorNome(doc);
        key = nome === "—" ? "sem-fornecedor" : nome.toLowerCase();
        label = nome === "—" ? "Sem fornecedor" : nome;
      } else {
        key = doc.dtEmissao ? doc.dtEmissao.slice(0, 10) : "sem-data";
        label = doc.dtEmissao ? formatDate(doc.dtEmissao) : "Sem data";
      }
      let gi = index.get(key);
      if (gi === undefined) {
        gi = groups.length;
        index.set(key, gi);
        groups.push({ key, label, items: [], total: 0 });
      }
      groups[gi].items.push(doc);
      groups[gi].total += calcValorTotal(doc);
    }
    if (filters.groupBy === "dia") {
      // Mais recente → mais antigo; "sem data" por último.
      groups.sort((a, b) =>
        a.key === "sem-data" ? 1 : b.key === "sem-data" ? -1 : b.key.localeCompare(a.key)
      );
    } else {
      // Ordem alfabética; "sem fornecedor" por último.
      groups.sort((a, b) =>
        a.key === "sem-fornecedor" ? 1 : b.key === "sem-fornecedor" ? -1 : a.label.localeCompare(b.label, "pt-BR")
      );
    }
    return groups;
  }, [filtered, filters.groupBy]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Documentos de Entrada"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Doc. de Entrada" }]}
        action={
          <Button asChild>
            <Link href="/suprimentos/conferencias/novo">Novo Documento de Entrada</Link>
          </Button>
        }
      />

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="px-8 pb-4 flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Buscar nº doc, NF, fornecedor, pedido…"
            value={filters.search}
            onChange={(e) => updateFilters({ search: e.target.value })}
          />
          {filters.search && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => updateFilters({ search: "" })}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status filter */}
        <div className="relative">
          <button
            className="flex items-center gap-2 h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            onClick={() => setShowStatusMenu((v) => !v)}
          >
            <span className="text-gray-700">{activeStatusLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>

          {showStatusMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
              <div className="absolute left-0 top-10 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 w-52">
                <button
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 font-medium"
                  onClick={() => updateFilters({ statuses: filters.statuses.length === ALL_STATUSES.length ? [] : [...ALL_STATUSES] })}
                >
                  {filters.statuses.length === ALL_STATUSES.length ? "Desmarcar todos" : "Selecionar todos"}
                </button>
                <div className="border-t border-gray-100 mt-1 pt-1">
                  {STATUS_COLS.map((s) => (
                    <button
                      key={s.key}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-gray-50"
                      onClick={() => {
                        const next = filters.statuses.includes(s.key)
                          ? filters.statuses.filter((x) => x !== s.key)
                          : [...filters.statuses, s.key];
                        updateFilters({ statuses: next });
                      }}
                    >
                      <span className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                        filters.statuses.includes(s.key) ? "bg-blue-600 border-blue-600" : "border-gray-300"
                      )}>
                        {filters.statuses.includes(s.key) && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className="text-gray-700">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Count */}
        <span className="text-xs text-gray-400">
          {loading ? "…" : `${filtered.length} documento${filtered.length !== 1 ? "s" : ""}`}
        </span>

        {/* Column configurator — list only */}
        {filters.view === "list" && (
          <ColumnConfigurator columns={COLS} order={colOrder} onOrderChange={setColOrder} visibility={colVis} onVisibilityChange={setColVis} onShowAll={showAllCols} />
        )}

        {/* Agrupamento — list only */}
        {filters.view === "list" && (
          <GroupByControl value={filters.groupBy} onChange={(v) => updateFilters({ groupBy: v })} />
        )}

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 border border-gray-200 rounded-lg p-0.5 bg-white">
          <button
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
              filters.view === "list" ? "bg-gray-100 text-gray-800" : "text-gray-500 hover:text-gray-700")}
            onClick={() => updateFilters({ view: "list" })}
          >
            <LayoutList className="w-3.5 h-3.5" /> Lista
          </button>
          <button
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
              filters.view === "kanban" ? "bg-gray-100 text-gray-800" : "text-gray-500 hover:text-gray-700")}
            onClick={() => updateFilters({ view: "kanban" })}
          >
            <Kanban className="w-3.5 h-3.5" /> Kanban
          </button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="px-8 pb-8 flex-1 overflow-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-lg font-medium">Nenhum documento encontrado</p>
          </div>
        ) : filters.view === "list" ? (
          /* ── List view ────────────────────────────────────────────────────── */
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {orderedCols.map((col) => (
                    <th key={col.id} className={col.thClass}>{col.label}</th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filters.groupBy !== "none" && groups
                  ? groups.map((g) => (
                      <Fragment key={g.key}>
                        <tr className="bg-gray-50/80">
                          <td colSpan={orderedCols.length + 1} className="px-4 py-2 border-y border-gray-200">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 font-semibold text-gray-700 text-sm">
                                {filters.groupBy === "dia"
                                  ? <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
                                  : <Building2 className="w-3.5 h-3.5 text-gray-400" />}
                                {g.label}
                              </span>
                              <span className="text-xs text-gray-400">
                                {g.items.length} documento{g.items.length !== 1 ? "s" : ""} · {formatBRL(g.total)}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {g.items.map((doc) => (
                          <tr
                            key={doc.id}
                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => router.push(`/suprimentos/conferencias/${doc.id}`)}
                          >
                            {orderedCols.map((col) => (
                              <td key={col.id} className={col.tdClass}>{col.render(doc)}</td>
                            ))}
                            <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                              <RowActionsMenu doc={doc} onDeleted={load} />
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))
                  : filtered.map((doc) => (
                      <tr
                        key={doc.id}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => router.push(`/suprimentos/conferencias/${doc.id}`)}
                      >
                        {orderedCols.map((col) => (
                          <td key={col.id} className={col.tdClass}>{col.render(doc)}</td>
                        ))}
                        <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <RowActionsMenu doc={doc} onDeleted={load} />
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* ── Kanban view ──────────────────────────────────────────────────── */
          <div className="flex gap-4 overflow-x-auto pb-2">
            {kanbanGroups.map((col) => (
              <div key={col.key} className="w-72 flex-shrink-0">
                <div className={cn(
                  "flex items-center justify-between px-3 py-2.5 rounded-t-xl border border-b-0",
                  col.bg, col.border
                )}>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs font-semibold uppercase tracking-wide", col.color)}>
                      {col.label}
                    </span>
                    <span className={cn(
                      "text-xs font-medium px-1.5 py-0.5 rounded-full border",
                      col.bg, col.color, col.border
                    )}>
                      {col.items.length}
                    </span>
                  </div>
                </div>
                <div className={cn(
                  "rounded-b-xl border p-2 min-h-[120px] flex flex-col gap-2",
                  col.bg, col.border
                )}>
                  {col.items.map((doc) => (
                    <KanbanCard key={doc.id} doc={doc} />
                  ))}
                  {col.items.length === 0 && (
                    <div className="flex-1 flex items-center justify-center py-6">
                      <p className={cn("text-xs", col.color, "opacity-50")}>Nenhum documento</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
