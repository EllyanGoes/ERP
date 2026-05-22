"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { usePersistedFilters } from "@/lib/use-persisted-filters";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatusBadge from "@/components/shared/StatusBadge";
import Link from "next/link";
import {
  Plus, Trash2, Loader2, AlertTriangle, ChevronRight, Building2,
  Search, X, ArrowUpDown, ChevronUp, ChevronDown as ChevronDownIcon, Check,
  LayoutList, Kanban,
} from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { useSession } from "@/lib/session-context";
import { useColumnOrder } from "@/lib/use-column-order";
import ColumnConfigurator, { ColDef } from "@/components/shared/ColumnConfigurator";

// ── Types ─────────────────────────────────────────────────────────────────────

type Necessidade = {
  id: string; numero: string; status: string; prioridade: number;
  solicitante: string | null; justificativa: string | null;
  dataNecessidade: string | null; createdAt: string;
  tipoCompra: string | null; motivo: string | null;
  filial: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  localEstoque: { id: string; nome: string } | null;
  setor: { id: string; nome: string } | null;
  _count: { itens: number };
  cotacoes?: Array<{ id: string; numero: string; status: string; pedidos: Array<{ id: string; numero: string; status: string }> }>;
  pedidosCompra?: Array<{ id: string; numero: string; status: string; conferencia: { id: string; numero: string; status: string } | null }>;
};

const STATUS_OPTIONS = [
  { value: "RASCUNHO",              label: "Rascunho" },
  { value: "AGUARDANDO_APROVACAO",  label: "Aguard. Aprovação" },
  { value: "APROVADA",              label: "Aprovada" },
  { value: "REJEITADA",             label: "Rejeitada" },
  { value: "EM_COTACAO",            label: "Em Cotação" },
  { value: "TOTALMENTE_ATENDIDA",   label: "Totalmente Atendida" },
  { value: "PARCIALMENTE_ATENDIDA", label: "Parcialmente Atendida" },
];

// Column config: which statuses show in kanban and their accent colors
const KANBAN_COLUMNS: { status: string; label: string; color: string; dot: string }[] = [
  { status: "RASCUNHO",              label: "Rascunho",              color: "bg-gray-100 border-gray-200",      dot: "bg-gray-400" },
  { status: "AGUARDANDO_APROVACAO",  label: "Aguard. Aprovação",     color: "bg-amber-50 border-amber-200",     dot: "bg-amber-400" },
  { status: "APROVADA",              label: "Aprovada",              color: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  { status: "REJEITADA",             label: "Rejeitada",             color: "bg-red-50 border-red-200",         dot: "bg-red-500" },
  { status: "EM_COTACAO",            label: "Em Cotação",            color: "bg-blue-50 border-blue-200",       dot: "bg-blue-500" },
  { status: "TOTALMENTE_ATENDIDA",   label: "Totalmente Atendida",   color: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-600" },
  { status: "PARCIALMENTE_ATENDIDA", label: "Parcialmente Atendida", color: "bg-orange-50 border-orange-200",   dot: "bg-orange-500" },
];

const SORT_OPTIONS = [
  { value: "createdAt_desc",  label: "Mais recente" },
  { value: "createdAt_asc",   label: "Mais antiga" },
  { value: "numero_asc",      label: "Número ↑" },
  { value: "numero_desc",     label: "Número ↓" },
  { value: "prioridade_desc", label: "Prioridade ↑" },
  { value: "prioridade_asc",  label: "Prioridade ↓" },
];

const PRIORIDADE_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: "Muito Baixa", color: "text-gray-400" },
  2: { label: "Baixa",       color: "text-blue-400" },
  3: { label: "Média",       color: "text-amber-500" },
  4: { label: "Alta",        color: "text-orange-500" },
  5: { label: "Crítica",     color: "text-red-600" },
};

// ── Column definitions ────────────────────────────────────────────────────────
// sortKey is needed for SortHeader in th — we define COLS with static th content
// and the SortHeader component stays in the `<th>` for Prioridade and Data.
// For COLS, we keep plain labels (SortHeader is a click button that changes sort,
// it can't be inside ColDef.thClass easily — so we define separate header rendering below).
const NECESSIDADES_COLS: ColDef<Necessidade>[] = [
  {
    id: "numero",
    label: "Número",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 w-28",
    tdClass: "px-4 py-3 font-mono text-xs font-medium text-gray-900",
    render: (n) => (
      <span className="flex items-center gap-1">
        {n.numero}
        <ChevronRight className="w-3 h-3 text-gray-300" />
      </span>
    ),
  },
  {
    id: "descricao",
    label: "Descrição",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3",
    render: (n) => (
      <>
        <p className="text-gray-800 truncate max-w-xs">{n.justificativa || <span className="text-gray-300 italic">Sem descrição</span>}</p>
        {n.tipoCompra && <p className="text-xs text-gray-400 mt-0.5">{n.tipoCompra}</p>}
      </>
    ),
  },
  {
    id: "solicitante",
    label: "Solicitante",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 w-32",
    tdClass: "px-4 py-3 text-gray-600 truncate",
    render: (n) => n.solicitante || "—",
  },
  {
    id: "setor",
    label: "Setor Solicitante",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 w-36",
    tdClass: "px-4 py-3 text-gray-600 truncate text-sm",
    render: (n) => n.setor?.nome ?? <span className="text-gray-300">—</span>,
  },
  {
    id: "status",
    label: "Status",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 w-36",
    tdClass: "px-4 py-3",
    render: (n) => <StatusBadge status={n.status} />,
  },
  {
    id: "prioridade",
    label: "Prioridade",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 w-28",
    tdClass: "px-4 py-3",
    render: (n) => {
      const prio = PRIORIDADE_LABEL[n.prioridade];
      return prio ? <span className={cn("text-xs font-semibold", prio.color)}>{n.prioridade} — {prio.label}</span> : null;
    },
  },
  {
    id: "data",
    label: "Data",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 w-32",
    tdClass: "px-4 py-3 text-gray-500 text-xs",
    render: (n) => n.dataNecessidade ? formatDate(n.dataNecessidade) : <span className="text-gray-300">—</span>,
  },
  {
    id: "itens",
    label: "Itens",
    thClass: "text-center px-4 py-3 font-medium text-gray-600 w-14",
    tdClass: "px-4 py-3 text-center text-gray-500",
    render: (n) => n._count.itens,
  },
  {
    id: "cotacao",
    label: "Cotação",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 w-36",
    tdClass: "px-4 py-3",
    render: (n) => {
      const cotacoes = n.cotacoes ?? [];
      if (cotacoes.length === 0) return <span className="text-gray-300 text-xs">—</span>;
      return (
        <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
          {cotacoes.map((c) => (
            <Link
              key={c.id}
              href={`/suprimentos/cotacoes/${c.id}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 transition-colors"
            >
              <span className="font-mono text-[10px] font-medium text-gray-600 hover:text-blue-700">{c.numero}</span>
              <StatusBadge status={c.status} />
            </Link>
          ))}
        </div>
      );
    },
  },
  {
    id: "pedidos_compra",
    label: "Pedidos de Compra",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 w-40",
    tdClass: "px-4 py-3",
    render: (n) => {
      const pedidos = n.pedidosCompra ?? [];
      if (pedidos.length === 0) return <span className="text-gray-300 text-xs">—</span>;
      return (
        <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
          {pedidos.map((p) => (
            <Link
              key={p.id}
              href={`/suprimentos/pedidos-compra/${p.id}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 transition-colors"
            >
              <span className="font-mono text-[10px] font-medium text-gray-600 hover:text-blue-700">{p.numero}</span>
              <StatusBadge status={p.status} />
            </Link>
          ))}
        </div>
      );
    },
  },
  {
    id: "doc_entrada",
    label: "Doc. de Entrada",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 w-40",
    tdClass: "px-4 py-3",
    render: (n) => {
      const conferencias = (n.pedidosCompra ?? [])
        .map((p) => p.conferencia)
        .filter((c): c is NonNullable<typeof c> => c !== null);
      if (conferencias.length === 0) return <span className="text-gray-300 text-xs">—</span>;
      return (
        <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
          {conferencias.map((c) => (
            <Link
              key={c.id}
              href={`/suprimentos/conferencias/${c.id}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 transition-colors"
            >
              <span className="font-mono text-[10px] font-medium text-gray-600 hover:text-blue-700">{c.numero}</span>
              <StatusBadge status={c.status} />
            </Link>
          ))}
        </div>
      );
    },
  },
];

// ── StatusFilterChip ──────────────────────────────────────────────────────────

type FilterOp = "is" | "is_not";

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
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
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
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  }

  const active = selected.length > 0;
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

// ── Drag & Drop helpers ───────────────────────────────────────────────────────

/** Returns the valid next status for a given SC status (for DnD progression) */
const SC_NEXT_STATUS: Record<string, string> = {
  RASCUNHO:             "AGUARDANDO_APROVACAO",
  AGUARDANDO_APROVACAO: "APROVADA",
  APROVADA:             "EM_COTACAO",
  REJEITADA:            "AGUARDANDO_APROVACAO",
};

/** Route to open when a card is dropped on its next column */
function scDropRoute(id: string, from: string, to: string): string | null {
  if (from === "RASCUNHO"             && to === "AGUARDANDO_APROVACAO") return `/compras/necessidades/${id}`;
  if (from === "AGUARDANDO_APROVACAO" && to === "APROVADA")             return `/compras/necessidades/${id}`;
  if (from === "APROVADA"             && to === "EM_COTACAO")           return `/suprimentos/cotacoes/nova?necessidadeId=${id}`;
  if (from === "REJEITADA"            && to === "AGUARDANDO_APROVACAO") return `/compras/necessidades/${id}`;
  return null;
}

// ── KanbanCard ────────────────────────────────────────────────────────────────

function KanbanCard({ n, onDelete, onClick, canDelete, onDragStart, onDragEnd, isDragging }: {
  n: Necessidade;
  onDelete: () => void;
  onClick: () => void;
  canDelete: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const prio = PRIORIDADE_LABEL[n.prioridade];
  const filialLabel = n.filial ? (n.filial.nomeFantasia || n.filial.razaoSocial) : null;

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
        <span className="font-mono text-xs font-bold text-gray-500">{n.numero}</span>
        {canDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
            title="Excluir"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-gray-800 font-medium leading-snug line-clamp-2 mb-2.5">
        {n.justificativa || <span className="text-gray-400 italic font-normal">Sem descrição</span>}
      </p>

      {/* Meta */}
      <div className="space-y-1.5">
        {filialLabel && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Building2 className="w-3 h-3 shrink-0 text-gray-400" />
            <span className="truncate">{filialLabel}</span>
          </div>
        )}
        {n.solicitante && (
          <p className="text-xs text-gray-500 truncate">👤 {n.solicitante}</p>
        )}
        {n.setor && (
          <p className="text-xs text-gray-500 truncate">🏢 {n.setor.nome}</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100">
        {prio && (
          <span className={cn("text-xs font-semibold", prio.color)}>
            {n.prioridade} — {prio.label}
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-gray-400">{n._count.itens} item{n._count.itens !== 1 ? "s" : ""}</span>
          <span className="text-xs text-gray-300">{formatDate(n.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

// ── KanbanView ────────────────────────────────────────────────────────────────

function KanbanView({ items, onDelete, onNavigate, canDelete, onCardDrop }: {
  items: Necessidade[];
  onDelete: (n: Necessidade) => void;
  onNavigate: (id: string) => void;
  canDelete: (n: Necessidade) => boolean;
  onCardDrop: (id: string, fromStatus: string, toStatus: string) => void;
}) {
  const [dragItem, setDragItem] = useState<{ id: string; status: string } | null>(null);
  const [overCol, setOverCol]   = useState<string | null>(null);

  const byStatus = useMemo(() => {
    const map = new Map<string, Necessidade[]>();
    for (const col of KANBAN_COLUMNS) map.set(col.status, []);
    for (const n of items) {
      if (map.has(n.status)) map.get(n.status)!.push(n);
    }
    return map;
  }, [items]);

  function isValidTarget(toStatus: string) {
    return !!dragItem && SC_NEXT_STATUS[dragItem.status] === toStatus;
  }

  function handleDrop(toStatus: string) {
    if (dragItem && isValidTarget(toStatus)) {
      onCardDrop(dragItem.id, dragItem.status, toStatus);
    }
    setDragItem(null);
    setOverCol(null);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 220px)" }}>
      {KANBAN_COLUMNS.map((col) => {
        const colItems   = byStatus.get(col.status) ?? [];
        const isOver     = overCol === col.status;
        const canReceive = isValidTarget(col.status);

        return (
          <div
            key={col.status}
            className="flex-shrink-0 w-72 flex flex-col"
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = canReceive ? "move" : "none"; }}
            onDragEnter={(e) => { e.preventDefault(); if (canReceive) setOverCol(col.status); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null); }}
            onDrop={(e) => { e.preventDefault(); handleDrop(col.status); }}
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
                  <p className="text-xs text-gray-300 italic">Nenhuma SC</p>
                </div>
              ) : colItems.length === 0 && isOver ? (
                <div className="flex-1 flex items-center justify-center py-8">
                  <p className="text-xs text-blue-400 font-medium">Soltar aqui</p>
                </div>
              ) : (
                colItems.map((n) => (
                  <KanbanCard
                    key={n.id}
                    n={n}
                    onDelete={() => onDelete(n)}
                    onClick={() => onNavigate(n.id)}
                    canDelete={canDelete(n)}
                    onDragStart={() => setDragItem({ id: n.id, status: n.status })}
                    onDragEnd={() => { setDragItem(null); setOverCol(null); }}
                    isDragging={dragItem?.id === n.id}
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
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NecessidadesPage() {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";
  function canDeleteSC(n: { status: string }) {
    if (["APROVADA", "EM_COTACAO", "TOTALMENTE_ATENDIDA", "PARCIALMENTE_ATENDIDA"].includes(n.status)) return isAdmin;
    return true;
  }
  const [necessidades, setNecessidades] = useState<Necessidade[]>([]);
  const [loading,      setLoading]      = useState(true);

  // Filters, sort AND view — all persisted
  const [f, setF] = usePersistedFilters("necessidades", {
    search:         "",
    filterStatuses: [] as string[],
    filterStatusOp: "is" as FilterOp,
    filterFilial:   "",
    sortKey:        "createdAt_desc",
    view:           "list" as "list" | "kanban",
  });
  const { search, filterStatuses, filterStatusOp, filterFilial, sortKey, view } = f;
  const setSearch         = (v: string)           => setF({ search: v });
  const setFilterStatuses = (v: string[])         => setF({ filterStatuses: v });
  const setFilterStatusOp = (v: FilterOp)         => setF({ filterStatusOp: v });
  const setFilterFilial   = (v: string)           => setF({ filterFilial: v });
  const setSortKey        = (v: string)           => setF({ sortKey: v });
  const setView           = (v: "list" | "kanban") => setF({ view: v });

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

  const filiais = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of necessidades) {
      if (n.filial) map.set(n.filial.id, n.filial.nomeFantasia || n.filial.razaoSocial);
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [necessidades]);

  const filtered = useMemo(() => {
    let list = [...necessidades];

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

    if (filterStatuses.length > 0) {
      if (filterStatusOp === "is") {
        list = list.filter((n) => filterStatuses.includes(n.status));
      } else {
        list = list.filter((n) => !filterStatuses.includes(n.status));
      }
    }

    if (filterFilial) list = list.filter((n) => n.filial?.id === filterFilial);

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
  }, [necessidades, search, filterStatuses, filterStatusOp, filterFilial, sortKey]);

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

  const hasFilters = search || filterStatuses.length > 0 || filterFilial;

  // Column order
  const [colOrder, setColOrder] = useColumnOrder("necessidades", NECESSIDADES_COLS.map((c) => c.id));
  const orderedNecCols = colOrder.map((id) => NECESSIDADES_COLS.find((c) => c.id === id)).filter((c): c is ColDef<Necessidade> => c !== undefined);

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

        {/* ── Toolbar ── */}
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

          {/* Status filter chip */}
          <StatusFilterChip
            selected={filterStatuses}
            op={filterStatusOp}
            onChange={setFilterStatuses}
            onOpChange={setFilterStatusOp}
            onClear={() => { setFilterStatuses([]); setFilterStatusOp("is"); }}
          />

          {/* Filial filter */}
          {filiais.length > 1 && (
            <select
              value={filterFilial}
              onChange={(e) => setFilterFilial(e.target.value)}
              className="h-8 px-3 text-sm border border-gray-200 rounded-full bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
            >
              <option value="">Todas as filiais</option>
              {filiais.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          )}

          {/* Sort — hidden in kanban since order within column is inherent */}
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

          {/* Clear all filters */}
          {hasFilters && (
            <button
              onClick={() => { setSearch(""); setFilterStatuses([]); setFilterStatusOp("is"); setFilterFilial(""); }}
              className="h-8 px-3 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-full hover:bg-gray-50 flex items-center gap-1 transition-colors"
            >
              <X className="w-3 h-3" /> Limpar tudo
            </button>
          )}

          {/* Column configurator — list view only */}
          {view === "list" && (
            <ColumnConfigurator columns={NECESSIDADES_COLS} order={colOrder} onOrderChange={setColOrder} />
          )}

          {/* View toggle */}
          <div className="ml-auto flex items-center gap-0.5 p-0.5 bg-gray-100 rounded-lg border border-gray-200">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                view === "list"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              <LayoutList className="w-4 h-4" />
              Lista
            </button>
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                view === "kanban"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              <Kanban className="w-4 h-4" />
              Kanban
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
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : view === "kanban" ? (
          /* ── KANBAN VIEW ── */
          filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
              <p className="text-lg font-medium">{hasFilters ? "Nenhum resultado encontrado" : "Nenhuma solicitação registrada"}</p>
              <p className="text-sm mt-1">{hasFilters ? "Tente ajustar os filtros." : "Clique em \"Nova Solicitação\" para começar."}</p>
            </div>
          ) : (
            <KanbanView
              items={filtered}
              onDelete={(n) => { setDeleteItem(n); setDeleteError(""); }}
              onNavigate={(id) => router.push(`/compras/necessidades/${id}`)}
              canDelete={canDeleteSC}
              onCardDrop={(id, from, to) => {
                const route = scDropRoute(id, from, to);
                if (route) router.push(route);
              }}
            />
          )
        ) : (
          /* ── LIST VIEW ── */
          filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
              <p className="text-lg font-medium">{hasFilters ? "Nenhum resultado encontrado" : "Nenhuma solicitação registrada"}</p>
              <p className="text-sm mt-1">{hasFilters ? "Tente ajustar os filtros." : "Clique em \"Nova Solicitação\" para começar."}</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.filialId ?? "sem"}>
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-500">{group.filialLabel}</span>
                  <span className="text-xs text-gray-400">({group.items.length})</span>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {orderedNecCols.map((col) => {
                          if (col.id === "prioridade") {
                            return (
                              <th key={col.id} className={col.thClass}>
                                <SortHeader label="Prioridade" field="prioridade" current={sortKey} onSort={setSortKey} />
                              </th>
                            );
                          }
                          if (col.id === "data") {
                            return (
                              <th key={col.id} className={col.thClass}>
                                <SortHeader label="Data" field="createdAt" current={sortKey} onSort={setSortKey} />
                              </th>
                            );
                          }
                          return <th key={col.id} className={col.thClass}>{col.label}</th>;
                        })}
                        <th className="w-12" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {group.items.map((n) => (
                        <tr
                          key={n.id}
                          className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                          onClick={() => router.push(`/compras/necessidades/${n.id}`)}
                        >
                          {orderedNecCols.map((col) => (
                            <td key={col.id} className={col.tdClass}>{col.render(n)}</td>
                          ))}
                          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            {canDeleteSC(n) && (
                              <button
                                onClick={() => { setDeleteItem(n); setDeleteError(""); }}
                                className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )
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
    <button type="button" onClick={toggle}
      className={cn("flex items-center gap-1 hover:text-gray-800 transition-colors", active ? "text-blue-600" : "text-gray-600")}>
      {label}
      {active
        ? curDir === "desc" ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
        : <ArrowUpDown className="w-3 h-3 opacity-40" />}
    </button>
  );
}
