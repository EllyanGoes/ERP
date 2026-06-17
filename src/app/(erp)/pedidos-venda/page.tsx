"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import NovoPedidoButton from "@/components/pedidos-venda/NovoPedidoButton";
import StatusBadge from "@/components/shared/StatusBadge";
import StatusDimBadges from "@/components/pedidos-venda/StatusDimBadges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL, formatDate, decimalToNumber, cn } from "@/lib/utils";
import { useColumnOrder } from "@/lib/use-column-order";
import { useColumnVisibility } from "@/lib/use-column-visibility";
import ColumnConfigurator, { ColDef } from "@/components/shared/ColumnConfigurator";
import { useTabTitle } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";
import {
  Search, X, LayoutList, Kanban, Loader2,
  ChevronDown as ChevronDownIcon, CalendarDays, Download, Check,
  ShoppingCart, AlertTriangle, Trash2, Shuffle,
} from "lucide-react";
import EmpresaTag from "@/components/shared/EmpresaTag";

// ── Types ─────────────────────────────────────────────────────────────────────
type PedidoRow = {
  empresaId?: string;
  id: string;
  numero: string;
  numeroOrcamento: string | null;
  status: string;
  statusEntrega?: string | null;
  statusFinanceiro?: string | null;
  dataEmissao: string;
  dataEntrega: string | null;
  valorTotal: unknown;
  condicaoPagamento: string | null;
  cliente: { id: string; razaoSocial: string; nomeFantasia: string | null };
  vendedor?: { id: string; nome: string } | null;
  minutas?: { numeroFisico: string | null }[];
  estoqueOrigemEmpresaId?: string | null;
  estoqueOrigemEmpresa?: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  _count?: { minutas: number };
};

type ItemPendente = {
  codigo: string; descricao: string; unidade: string;
  pedida: number; entregue: number; pendente: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const FILTER_KEY = "erp:pedidos-venda:filters:v2";

const STATUS_COLS: { key: string; label: string; color: string; bg: string; border: string; dot: string }[] = [
  { key: "ORCAMENTO",   label: "Orçamento",   color: "text-gray-500",    bg: "bg-gray-50",    border: "border-gray-200",   dot: "bg-gray-400"   },
  { key: "CONFIRMADO",  label: "Confirmado",  color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-200",   dot: "bg-blue-500"   },
  { key: "EM_AGENDAMENTO", label: "Em Agendamento", color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200", dot: "bg-violet-500" },
  { key: "CONCLUIDO",   label: "Concluído",   color: "text-emerald-800", bg: "bg-emerald-50", border: "border-emerald-200",dot: "bg-emerald-600"},
  { key: "CANCELADO",   label: "Cancelado",   color: "text-red-500",     bg: "bg-red-50",     border: "border-red-200",    dot: "bg-red-400"    },
];

const STATUS_OPTIONS = STATUS_COLS.map((s) => ({ value: s.key, label: s.label }));

const SORT_OPTIONS = [
  { value: "dataEmissao_desc", label: "Emissão — mais recente" },
  { value: "dataEmissao_asc",  label: "Emissão — mais antigo" },
  { value: "total_desc",       label: "Total — maior" },
  { value: "total_asc",        label: "Total — menor" },
  { value: "numero_asc",       label: "Número — crescente" },
];

// ── Filter types ──────────────────────────────────────────────────────────────
type FilterOp = "is" | "is_not";
type Filters = {
  search:    string;
  statuses:  string[];
  statusOp:  FilterOp;
  sortKey:   string;
  view:      "list" | "kanban";
  dateFrom:  string;
  dateTo:    string;
  groupBy:   "none" | "date" | "status";
  semOrcamento: boolean;
  aOrdem:    boolean;
};

function loadFilters(): Filters {
  const base: Filters = { search: "", statuses: [], statusOp: "is_not", sortKey: "dataEmissao_desc", view: "list", dateFrom: "", dateTo: "", groupBy: "none", semOrcamento: false, aOrdem: false };
  if (typeof window === "undefined") return base;
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) {
      const f = JSON.parse(raw) as Partial<Filters> & { groupByDate?: boolean };
      return {
        search:   f.search   ?? "",
        statuses: Array.isArray(f.statuses) ? f.statuses : [],
        statusOp: f.statusOp === "is" ? "is" : "is_not",
        sortKey:  f.sortKey  ?? "dataEmissao_desc",
        view:     f.view === "kanban" ? "kanban" : "list",
        dateFrom: f.dateFrom ?? "",
        dateTo:   f.dateTo   ?? "",
        groupBy:  f.groupBy === "date" || f.groupBy === "status" ? f.groupBy : (f.groupByDate === true ? "date" : "none"),
        semOrcamento: f.semOrcamento === true,
        aOrdem:   f.aOrdem === true,
      };
    }
  } catch {}
  return base;
}

function saveFilters(f: Filters) {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch {}
}

// ── Column definitions ────────────────────────────────────────────────────────
const COLS: ColDef<PedidoRow>[] = [
  {
    id: "numero",
    label: "Número",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 font-mono text-xs font-semibold text-gray-900",
    render: (p) => p.numero,
  },
  {
    id: "cliente",
    label: "Cliente",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 max-w-[220px]",
    render: (p) => (
      <div>
        <div className="font-medium text-gray-800 text-sm">{p.cliente.razaoSocial}</div>
        {p.cliente.nomeFantasia && (
          <div className="text-xs text-gray-400">{p.cliente.nomeFantasia}</div>
        )}
        {p.vendedor && (
          <div className="text-[11px] text-gray-400">Vendedor: {p.vendedor.nome}</div>
        )}
      </div>
    ),
  },
  {
    id: "numeroOrcamento",
    label: "Nº Orçamento",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-gray-500 text-sm",
    render: (p) => p.numeroOrcamento || <span className="text-gray-300">—</span>,
  },
  {
    id: "status",
    label: "Status",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3",
    render: (p) => (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge status={p.status} />
        <StatusDimBadges entrega={p.statusEntrega} financeiro={p.statusFinanceiro} />
      </div>
    ),
  },
  {
    id: "tipoVenda",
    label: "Tipo",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3",
    render: (p) => p.estoqueOrigemEmpresaId ? (
      <span className="inline-flex flex-col items-start gap-0.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-100 text-violet-700 border border-violet-200">
          <Shuffle className="w-3 h-3" /> À ordem
        </span>
        {p.estoqueOrigemEmpresa && (
          <span className="text-[11px] text-gray-400">
            de {p.estoqueOrigemEmpresa.nomeFantasia || p.estoqueOrigemEmpresa.razaoSocial}
          </span>
        )}
      </span>
    ) : (
      <span className="text-xs text-gray-300">Normal</span>
    ),
  },
  {
    id: "dataEmissao",
    label: "Emissão",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-gray-500 text-sm",
    render: (p) => formatDate(p.dataEmissao),
  },
  {
    id: "dataEntrega",
    label: "Conclusão",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell",
    tdClass: "px-4 py-3 text-gray-500 text-sm hidden lg:table-cell",
    render: (p) => p.dataEntrega ? formatDate(p.dataEntrega) : "—",
  },
  {
    id: "condicaoPagamento",
    label: "Cond. Pagamento",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 hidden xl:table-cell",
    tdClass: "px-4 py-3 text-gray-500 text-sm hidden xl:table-cell",
    render: (p) => p.condicaoPagamento ?? <span className="text-gray-300">—</span>,
  },
  {
    id: "minutas",
    label: "Minutas",
    thClass: "text-center px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-center",
    render: (p) => {
      const n = p._count?.minutas ?? 0;
      if (n === 0) return <span className="text-gray-300 text-xs">—</span>;
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
          {n}
        </span>
      );
    },
  },
  {
    id: "valorTotal",
    label: "Total",
    thClass: "text-right px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-right font-semibold text-gray-900",
    render: (p) => formatBRL(decimalToNumber(p.valorTotal)),
  },
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
  const [open, setOpen]           = useState(false);
  const [showOpMenu, setShowOpMenu] = useState(false);
  const [mounted, setMounted]     = useState(false);
  const btnRef  = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const opRef   = useRef<HTMLButtonElement>(null);
  const [pos, setPos]     = useState<{ top: number; left: number; width: number } | null>(null);
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
          onClick={() => {
            const r = btnRef.current?.getBoundingClientRect();
            if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 240) });
            setOpen((p) => !p); setShowOpMenu(false);
          }}
          className="pl-3 pr-1 h-full flex items-center gap-1.5 rounded-l-full"
        >
          <span className={cn("text-xs font-semibold", active ? "text-blue-500" : "text-gray-400")}>Status</span>
          {active && (
            <>
              <button
                ref={opRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const r = opRef.current?.getBoundingClientRect();
                  if (r) setOpPos({ top: r.bottom + 4, left: r.left });
                  setShowOpMenu((p) => !p); setOpen(false);
                }}
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
          <ChevronDownIcon className={cn("w-3 h-3 ml-0.5 transition-transform", open && "rotate-180", active ? "text-blue-400" : "text-gray-400")} />
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
              return (
                <button key={opt.value} type="button" onClick={() => toggle(opt.value)}
                  className={cn("w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-left", checked && "bg-blue-50/60")}>
                  <span className={cn("w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors", checked ? "bg-blue-600 border-blue-600" : "border-gray-300")}>
                    {checked && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <StatusBadge status={opt.value} />
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

// ── Kanban card ───────────────────────────────────────────────────────────────
function KanbanCard({
  p, onClick, onDragStart, onDragEnd, isDragging,
}: {
  p: PedidoRow;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        "bg-white border border-gray-200 rounded-lg p-3 shadow-sm transition-all cursor-grab active:cursor-grabbing group",
        isDragging
          ? "opacity-40 scale-95 shadow-none"
          : "hover:shadow-md hover:border-blue-300"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-mono text-xs font-semibold text-gray-800">{p.numero}</span> <EmpresaTag empresaId={p.empresaId} />
        <StatusBadge status={p.status} />
      </div>
      <p className="text-xs text-gray-700 font-medium mb-1 leading-snug line-clamp-2">
        {p.cliente.nomeFantasia || p.cliente.razaoSocial}
      </p>
      {p.estoqueOrigemEmpresaId && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700 border border-violet-200 mb-1">
          <Shuffle className="w-2.5 h-2.5" /> À ordem
        </span>
      )}
      {p.condicaoPagamento && (
        <p className="text-xs text-gray-400 mb-1">{p.condicaoPagamento}</p>
      )}
      <StatusDimBadges entrega={p.statusEntrega} financeiro={p.statusFinanceiro} className="mb-1" />
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
        <span className="text-xs font-semibold text-gray-900">{formatBRL(decimalToNumber(p.valorTotal))}</span>
        {p.dataEntrega && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <CalendarDays className="w-3 h-3" />
            {formatDate(p.dataEntrega)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PedidosVendaPage() {
  useTabTitle("Pedidos de Venda");
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";

  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [delTarget, setDelTarget] = useState<PedidoRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(loadFilters);

  // ── Drag-and-drop state ───────────────────────────────────────────────────
  const [draggingId, setDraggingId]     = useState<string | null>(null);
  const [dragOverCol, setDragOverCol]   = useState<string | null>(null);
  const [blockModal, setBlockModal]     = useState<{ msg: string; pendentes: ItemPendente[] } | null>(null);

  // Column order + visibility
  const [colOrder, setColOrder]          = useColumnOrder("pedidos-venda", COLS.map((c) => c.id));
  const [colVis, setColVis, showAllCols] = useColumnVisibility("pedidos-venda", COLS.map((c) => c.id));
  const orderedCols = colOrder
    .map((id) => COLS.find((c) => c.id === id))
    .filter((c): c is ColDef<PedidoRow> => c !== undefined && colVis[c.id] !== false);

  function updateFilters(partial: Partial<Filters>) {
    setFilters((prev) => {
      const next = { ...prev, ...partial };
      saveFilters(next);
      return next;
    });
  }

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

  // ── Exclusão definitiva (somente ADMIN) ───────────────────────────────────
  async function confirmDelete() {
    if (!delTarget) return;
    setDeleting(true);
    setDelError(null);
    try {
      const res = await fetch(`/api/pedidos-venda/${delTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setDelError(json.error ?? "Não foi possível excluir o pedido.");
        return;
      }
      setPedidos((prev) => prev.filter((p) => p.id !== delTarget.id));
      setDelTarget(null);
    } catch {
      setDelError("Erro de conexão ao excluir o pedido.");
    } finally {
      setDeleting(false);
    }
  }

  // ── Filtering + sorting ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase().trim();
    let list = pedidos.filter((p) => {
      if (filters.statuses.length > 0) {
        if (filters.statusOp === "is"     && !filters.statuses.includes(p.status)) return false;
        if (filters.statusOp === "is_not" &&  filters.statuses.includes(p.status)) return false;
      }
      if (filters.semOrcamento && (p.numeroOrcamento ?? "").trim() !== "") return false;
      if (filters.aOrdem && !p.estoqueOrigemEmpresaId) return false;
      // Compara a data-calendário (UTC, igual ao formatDate exibido na coluna)
      // como string YYYY-MM-DD — evita desvio de fuso no limite do período.
      if (filters.dateFrom || filters.dateTo) {
        const emiss = String(p.dataEmissao).slice(0, 10);
        if (filters.dateFrom && emiss < filters.dateFrom) return false;
        if (filters.dateTo && emiss > filters.dateTo) return false;
      }
      if (!q) return true;
      return (
        p.numero.toLowerCase().includes(q) ||
        (p.numeroOrcamento ?? "").toLowerCase().includes(q) ||
        (p.minutas ?? []).some((mn) => (mn.numeroFisico ?? "").toLowerCase().includes(q)) ||
        p.cliente.razaoSocial.toLowerCase().includes(q) ||
        (p.cliente.nomeFantasia ?? "").toLowerCase().includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      switch (filters.sortKey) {
        case "dataEmissao_asc":  return new Date(a.dataEmissao).getTime() - new Date(b.dataEmissao).getTime();
        case "dataEmissao_desc": return new Date(b.dataEmissao).getTime() - new Date(a.dataEmissao).getTime();
        case "total_desc":       return decimalToNumber(b.valorTotal) - decimalToNumber(a.valorTotal);
        case "total_asc":        return decimalToNumber(a.valorTotal) - decimalToNumber(b.valorTotal);
        case "numero_asc":       return a.numero.localeCompare(b.numero);
        default:                 return 0;
      }
    });

    return list;
  }, [pedidos, filters]);

  // ── Kanban grouped ────────────────────────────────────────────────────────
  const kanbanGroups = useMemo(
    () => STATUS_COLS
      .filter((col) => col.key !== "CANCELADO") // Cancelado não aparece no kanban
      .map((col) => ({ ...col, items: filtered.filter((p) => p.status === col.key) }))
      .filter((col) => {
        if (filters.statuses.length === 0) return true;
        if (filters.statusOp === "is")     return  filters.statuses.includes(col.key);
        if (filters.statusOp === "is_not") return !filters.statuses.includes(col.key);
        return true;
      }),
    [filtered, filters.statuses, filters.statusOp]
  );

  // ── Agrupado (visão lista) — por data de emissão ou por status ────────────
  const listGroups = useMemo(() => {
    if (filters.groupBy === "none") return [];
    const groups: { key: string; label: string; items: PedidoRow[]; total: number }[] = [];
    const index = new Map<string, number>();
    const push = (key: string, label: string, p: PedidoRow) => {
      let gi = index.get(key);
      if (gi === undefined) {
        gi = groups.length;
        index.set(key, gi);
        groups.push({ key, label, items: [], total: 0 });
      }
      groups[gi].items.push(p);
      groups[gi].total += decimalToNumber(p.valorTotal);
    };

    if (filters.groupBy === "status") {
      for (const p of filtered) {
        const col = STATUS_COLS.find((c) => c.key === p.status);
        push(p.status || "sem-status", col?.label ?? (p.status || "Sem status"), p);
      }
      const ordem = new Map(STATUS_COLS.map((c, i) => [c.key, i]));
      groups.sort((a, b) => (ordem.get(a.key) ?? 99) - (ordem.get(b.key) ?? 99));
    } else {
      for (const p of filtered) {
        const key = p.dataEmissao ? p.dataEmissao.slice(0, 10) : "sem-data";
        push(key, p.dataEmissao ? formatDate(p.dataEmissao) : "Sem data", p);
      }
      // Mais recente para o mais antigo; "sem data" por último.
      groups.sort((a, b) =>
        a.key === "sem-data" ? 1 : b.key === "sem-data" ? -1 : b.key.localeCompare(a.key)
      );
    }
    return groups;
  }, [filtered, filters.groupBy]);

  const hasActive = filters.statuses.length > 0 || filters.search || filters.dateFrom || filters.dateTo || filters.semOrcamento || filters.aOrdem;

  // ── Drag-and-drop handlers ────────────────────────────────────────────────
  async function moveCard(pedidoId: string, newStatus: string) {
    // Optimistic update
    setPedidos((prev) => prev.map((p) => p.id === pedidoId ? { ...p, status: newStatus } : p));
    try {
      const res = await fetch(`/api/pedidos-venda/${pedidoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        // Desfaz o movimento otimista (recarrega do servidor) e avisa o usuário.
        await load();
        setBlockModal({
          msg: json.error ?? "Não foi possível mover o pedido para este status.",
          pendentes: Array.isArray(json.pendentes) ? json.pendentes : [],
        });
      }
    } catch {
      // revert on failure
      await load();
    }
  }

  function handleDragStart(e: React.DragEvent, pedidoId: string) {
    setDraggingId(pedidoId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("pedidoId", pedidoId);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverCol(null);
  }

  function handleDragOver(e: React.DragEvent, colKey: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(colKey);
  }

  function handleDrop(e: React.DragEvent, colKey: string) {
    e.preventDefault();
    const pedidoId = e.dataTransfer.getData("pedidoId");
    const pedido = pedidos.find((p) => p.id === pedidoId);
    if (pedidoId && pedido && pedido.status !== colKey) {
      moveCard(pedidoId, colKey);
    }
    setDraggingId(null);
    setDragOverCol(null);
  }

  // ── PDF export ────────────────────────────────────────────────────────────
  async function downloadPDF() {
    const { default: jsPDF }      = await import("jspdf");
    const { default: autoTable }  = await import("jspdf-autotable");

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Pedidos de Venda", 14, 16);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    const filterLabel = filters.statuses.length === 0
      ? "Todos os status"
      : filters.statuses.map((s) => STATUS_COLS.find((c) => c.key === s)?.label ?? s).join(", ");
    doc.text(`Filtro: ${filterLabel}${filters.search ? `  |  Busca: "${filters.search}"` : ""}`, 14, 22);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}  |  ${filtered.length} pedido(s)`, 14, 27);
    doc.setTextColor(0);

    const STATUS_LABEL: Record<string, string> = {
      ORCAMENTO:   "Orçamento",
      CONFIRMADO:  "Confirmado",
      EM_AGENDAMENTO: "Em Agendamento",
      CONCLUIDO:   "Concluído",
      CANCELADO:   "Cancelado",
    };

    autoTable(doc, {
      startY: 32,
      head: [["Número", "Cliente", "Status", "Emissão", "Conclusão", "Cond. Pagamento", "Total"]],
      body: filtered.map((p) => [
        p.numero,
        p.cliente.nomeFantasia || p.cliente.razaoSocial,
        STATUS_LABEL[p.status] ?? p.status,
        formatDate(p.dataEmissao),
        p.dataEntrega ? formatDate(p.dataEntrega) : "—",
        p.condicaoPagamento ?? "—",
        formatBRL(decimalToNumber(p.valorTotal)),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 26, fontStyle: "bold" },
        1: { cellWidth: 55 },
        2: { cellWidth: 26 },
        3: { cellWidth: 24 },
        4: { cellWidth: 24 },
        5: { cellWidth: 40 },
        6: { cellWidth: 26, halign: "right" },
      },
      margin: { left: 14, right: 14 },
    });

    const totalGeral = filtered.reduce((s, p) => s + decimalToNumber(p.valorTotal), 0);
    const finalY = (doc as InstanceType<typeof jsPDF> & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`Total geral: ${formatBRL(totalGeral)}`, doc.internal.pageSize.width - 14, finalY, { align: "right" });

    doc.save(`pedidos-venda-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Pedidos de Venda"
        breadcrumbs={[{ label: "Faturamento" }, { label: "Pedidos de Venda" }]}
        action={
          <NovoPedidoButton onCreated={load} />
        }
      />

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="px-8 pb-4 flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Número, orçamento, físico, cliente..."
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
        <StatusFilterChip
          selected={filters.statuses}
          op={filters.statusOp}
          onChange={(v) => updateFilters({ statuses: v })}
          onOpChange={(v) => updateFilters({ statusOp: v })}
          onClear={() => updateFilters({ statuses: [], statusOp: "is" })}
        />

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => updateFilters({ dateFrom: e.target.value })}
            className="h-8 w-36 border-gray-200 text-sm"
            title="De"
          />
          <span className="text-gray-300 text-sm">—</span>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => updateFilters({ dateTo: e.target.value })}
            className="h-8 w-36 border-gray-200 text-sm"
            title="Até"
          />
        </div>

        {/* Sem orçamento */}
        <button
          onClick={() => updateFilters({ semOrcamento: !filters.semOrcamento })}
          className={cn(
            "flex items-center gap-1.5 h-8 px-2.5 text-xs border rounded-md transition-colors whitespace-nowrap",
            filters.semOrcamento
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          )}
          title="Mostrar só pedidos sem Nº de Orçamento"
        >
          Sem orçamento
        </button>

        {/* Venda à ordem */}
        <button
          onClick={() => updateFilters({ aOrdem: !filters.aOrdem })}
          className={cn(
            "flex items-center gap-1.5 h-8 px-2.5 text-xs border rounded-md transition-colors whitespace-nowrap",
            filters.aOrdem
              ? "border-violet-300 bg-violet-50 text-violet-700"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          )}
          title="Mostrar só pedidos de venda à ordem (estoque de outra empresa do grupo)"
        >
          <Shuffle className="w-3.5 h-3.5" />
          À ordem
        </button>

        {/* Limpar tudo */}
        {hasActive && (
          <button
            onClick={() => updateFilters({ search: "", statuses: [], statusOp: "is", dateFrom: "", dateTo: "", semOrcamento: false, aOrdem: false })}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors whitespace-nowrap"
          >
            Limpar tudo
          </button>
        )}

        {/* Results count */}
        <span className="text-xs text-gray-400">
          {loading ? "…" : `${filtered.length} pedido${filtered.length !== 1 ? "s" : ""}`}
        </span>

        {/* Sort — list only */}
        {filters.view === "list" && (
          <div className="flex items-center gap-1.5">
            <select
              value={filters.sortKey}
              onChange={(e) => updateFilters({ sortKey: e.target.value })}
              className="h-8 px-2.5 pr-7 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-600"
            >
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}

        {/* Agrupar por — list only */}
        {filters.view === "list" && (
          <select
            value={filters.groupBy}
            onChange={(e) => updateFilters({ groupBy: e.target.value as Filters["groupBy"] })}
            className={cn(
              "h-8 px-2.5 pr-7 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400",
              filters.groupBy !== "none"
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-gray-600"
            )}
            title="Agrupar pedidos"
          >
            <option value="none">Sem agrupar</option>
            <option value="date">Agrupar por data</option>
            <option value="status">Agrupar por status</option>
          </select>
        )}

        {/* Column configurator */}
        {filters.view === "list" && (
          <ColumnConfigurator
            columns={COLS}
            order={colOrder}
            onOrderChange={setColOrder}
            visibility={colVis}
            onVisibilityChange={setColVis}
            onShowAll={showAllCols}
          />
        )}

        {/* PDF download */}
        <button
          onClick={downloadPDF}
          disabled={loading || filtered.length === 0}
          className="flex items-center gap-1.5 h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-gray-700"
          title="Baixar PDF dos pedidos filtrados"
        >
          <Download className="w-3.5 h-3.5" />
          PDF
        </button>

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 border border-gray-200 rounded-lg p-0.5 bg-white">
          <button
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
              filters.view === "list" ? "bg-gray-100 text-gray-800" : "text-gray-500 hover:text-gray-700")}
            onClick={() => updateFilters({ view: "list" })}
          >
            <LayoutList className="w-3.5 h-3.5" />
            Lista
          </button>
          <button
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
              filters.view === "kanban" ? "bg-gray-100 text-gray-800" : "text-gray-500 hover:text-gray-700")}
            onClick={() => updateFilters({ view: "kanban" })}
          >
            <Kanban className="w-3.5 h-3.5" />
            Kanban
          </button>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Carregando pedidos…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-2">
          <ShoppingCart className="w-8 h-8 text-gray-300" />
          <p className="text-sm font-medium">Nenhum pedido encontrado</p>
          <p className="text-xs">Tente ajustar os filtros ou crie um novo pedido.</p>
        </div>
      ) : filters.view === "list" ? (
        // ── List view ──────────────────────────────────────────────────────
        <div className="px-8 pb-8">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {orderedCols.map((col) => (
                    <th key={col.id} className={col.thClass}>{col.label}</th>
                  ))}
                  {isAdmin && <th className="px-4 py-3 w-12" aria-label="Ações" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filters.groupBy !== "none"
                  ? listGroups.map((g) => (
                      <Fragment key={g.key}>
                        <tr className="bg-gray-50/80">
                          <td colSpan={orderedCols.length + (isAdmin ? 1 : 0)} className="px-4 py-2 border-y border-gray-200">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 font-semibold text-gray-700 text-sm">
                                {filters.groupBy === "status" ? (
                                  <span className={cn("w-2 h-2 rounded-full shrink-0", STATUS_COLS.find((c) => c.key === g.key)?.dot ?? "bg-gray-300")} />
                                ) : (
                                  <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
                                )}
                                {g.label}
                              </span>
                              <span className="text-xs text-gray-400">
                                {g.items.length} pedido{g.items.length !== 1 ? "s" : ""} · {formatBRL(g.total)}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {g.items.map((p) => (
                          <tr
                            key={p.id}
                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => router.push(`/pedidos-venda/${p.id}`)}
                          >
                            {orderedCols.map((col) => (
                              <td key={col.id} className={col.tdClass}>{col.render(p)}</td>
                            ))}
                            {isAdmin && (
                              <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setDelError(null); setDelTarget(p); }}
                                  className="text-gray-300 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50"
                                  title="Excluir pedido"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </Fragment>
                    ))
                  : filtered.map((p) => (
                      <tr
                        key={p.id}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => router.push(`/pedidos-venda/${p.id}`)}
                      >
                        {orderedCols.map((col) => (
                          <td key={col.id} className={col.tdClass}>{col.render(p)}</td>
                        ))}
                        {isAdmin && (
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setDelError(null); setDelTarget(p); }}
                              className="text-gray-300 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50"
                              title="Excluir pedido"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // ── Kanban view ────────────────────────────────────────────────────
        <div className="px-8 pb-8 flex-1 overflow-x-auto">
          <div className="flex gap-4 min-w-max">
            {kanbanGroups.map((col) => {
              const isOver = dragOverCol === col.key;
              const draggingPedido = draggingId ? pedidos.find((p) => p.id === draggingId) : null;
              const canDrop = draggingPedido && draggingPedido.status !== col.key;
              return (
                <div key={col.key} className="w-72 flex-shrink-0">
                  <div className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-t-xl border border-b-0",
                    col.bg, col.border
                  )}>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs font-semibold uppercase tracking-wide", col.color)}>
                        {col.label}
                      </span>
                      <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded-full border", col.bg, col.color, col.border)}>
                        {col.items.length}
                      </span>
                    </div>
                    {col.items.length > 0 && (
                      <span className="text-xs text-gray-500">
                        {formatBRL(col.items.reduce((s, p) => s + decimalToNumber(p.valorTotal), 0))}
                      </span>
                    )}
                  </div>
                  <div
                    onDragOver={(e) => handleDragOver(e, col.key)}
                    onDragLeave={() => setDragOverCol(null)}
                    onDrop={(e) => handleDrop(e, col.key)}
                    className={cn(
                      "rounded-b-xl border min-h-[120px] p-2 space-y-2 transition-colors",
                      col.border,
                      isOver && canDrop
                        ? "bg-blue-50/80 border-blue-300 border-dashed"
                        : "bg-gray-50/60"
                    )}
                  >
                    {col.items.length === 0 && !isOver ? (
                      <div className="flex items-center justify-center py-8 text-xs text-gray-300">
                        {draggingId ? "Soltar aqui" : "Vazio"}
                      </div>
                    ) : isOver && canDrop && col.items.length === 0 ? (
                      <div className="flex items-center justify-center py-8 text-xs text-blue-400 font-medium">
                        Soltar aqui
                      </div>
                    ) : (
                      col.items.map((p) => (
                        <KanbanCard
                          key={p.id}
                          p={p}
                          isDragging={draggingId === p.id}
                          onClick={() => { if (!draggingId) router.push(`/pedidos-venda/${p.id}`); }}
                          onDragStart={(e) => handleDragStart(e, p.id)}
                          onDragEnd={handleDragEnd}
                        />
                      ))
                    )}
                    {isOver && canDrop && col.items.length > 0 && (
                      <div className="flex items-center justify-center py-3 text-xs text-blue-400 font-medium border-2 border-dashed border-blue-300 rounded-lg">
                        Soltar aqui
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {blockModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setBlockModal(null)}
        >
          <div
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Não é possível concluir o pedido</h3>
                <p className="text-sm text-gray-600 mt-0.5">{blockModal.msg}</p>
              </div>
            </div>
            {blockModal.pendentes.length > 0 && (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-3 py-2 font-semibold">Item</th>
                      <th className="text-right px-3 py-2 font-semibold">Falta entregar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {blockModal.pendentes.map((p) => (
                      <tr key={p.codigo}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800">{p.descricao}</div>
                          <div className="text-xs text-gray-400">{p.codigo}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-amber-700">
                          {p.pendente.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}{" "}
                          <span className="text-gray-400 text-xs font-normal">{p.unidade}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end pt-1">
              <Button onClick={() => setBlockModal(null)} className="font-semibold">Entendi</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmação de exclusão (ADMIN) ─────────────────────────────────── */}
      {delTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!deleting) setDelTarget(null); }}
        >
          <div
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Excluir o pedido {delTarget.numero}?</h3>
                <p className="text-sm text-gray-600 mt-0.5">
                  {delTarget.cliente.nomeFantasia || delTarget.cliente.razaoSocial} · {formatBRL(decimalToNumber(delTarget.valorTotal))}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Esta ação é <span className="font-semibold text-gray-700">permanente</span> e remove o lançamento e seus itens.
                  Para apenas arquivar, mude o status para <span className="font-medium">Cancelado</span>.
                </p>
              </div>
            </div>
            {delError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {delError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDelTarget(null)} disabled={deleting}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={confirmDelete} disabled={deleting} className="font-semibold">
                {deleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Excluindo…</> : "Excluir"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
