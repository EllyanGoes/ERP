"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, cn } from "@/lib/utils";
import { useColumnOrder } from "@/lib/use-column-order";
import { useColumnVisibility } from "@/lib/use-column-visibility";
import ColumnConfigurator, { ColDef } from "@/components/shared/ColumnConfigurator";
import { useTabTitle } from "@/lib/tabs-context";
import { statusMinutaLabel, TIPO_MINUTA_LABEL, type TipoMinuta } from "@/lib/minuta-labels";
import {
  Plus, Search, X, LayoutList, Kanban, Loader2,
  ChevronDown as ChevronDownIcon, CalendarDays, Download, Check, Truck,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Minuta = {
  id: string;
  numero: string;
  tipo: TipoMinuta;
  status: "PENDENTE" | "SAIU_PARA_ENTREGA" | "ENTREGUE" | "CANCELADA";
  dataEmissao: string;
  dataEntrega: string | null;
  motorista: { id: string; nome: string } | null;
  placa: string | null;
  pedidoVenda: {
    id: string;
    numero: string;
    cliente: { razaoSocial: string; nomeFantasia: string | null };
  };
  localEstoque: { id: string; nome: string } | null;
  itens: { id: string }[];
};

// ── Constants ─────────────────────────────────────────────────────────────────
const FILTER_KEY = "erp:minutas:filters:v1";

const STATUS_COLS: {
  key: Minuta["status"]; label: string;
  color: string; bg: string; border: string; dot: string;
}[] = [
  { key: "PENDENTE",          label: "Pendente",        color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200",   dot: "bg-amber-400"   },
  { key: "SAIU_PARA_ENTREGA", label: "Saiu p/ Entrega", color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200",    dot: "bg-blue-500"    },
  { key: "ENTREGUE",          label: "Entregue",        color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500" },
  { key: "CANCELADA",         label: "Cancelada",       color: "text-red-600",     bg: "bg-red-50",     border: "border-red-200",     dot: "bg-red-400"     },
];

const STATUS_OPTIONS = STATUS_COLS.map((s) => ({ value: s.key, label: s.label }));

const SORT_OPTIONS = [
  { value: "dataEmissao_desc", label: "Emissão — mais recente" },
  { value: "dataEmissao_asc",  label: "Emissão — mais antigo" },
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
};

function loadFilters(): Filters {
  if (typeof window === "undefined")
    return { search: "", statuses: [], statusOp: "is_not", sortKey: "dataEmissao_desc", view: "list", dateFrom: "", dateTo: "" };
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) {
      const f = JSON.parse(raw) as Filters;
      return {
        search:   f.search   ?? "",
        statuses: Array.isArray(f.statuses) ? f.statuses : [],
        statusOp: f.statusOp === "is" ? "is" : "is_not",
        sortKey:  f.sortKey  ?? "dataEmissao_desc",
        view:     f.view === "kanban" ? "kanban" : "list",
        dateFrom: f.dateFrom ?? "",
        dateTo:   f.dateTo   ?? "",
      };
    }
  } catch {}
  return { search: "", statuses: [], statusOp: "is_not", sortKey: "dataEmissao_desc", view: "list", dateFrom: "", dateTo: "" };
}

function saveFilters(f: Filters) {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch {}
}

// ── Column definitions ────────────────────────────────────────────────────────
const COLS: ColDef<Minuta>[] = [
  {
    id: "numero",
    label: "Minuta",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 font-mono text-xs font-semibold text-gray-900",
    render: (m) => m.numero,
  },
  {
    id: "pedido",
    label: "Pedido",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 font-mono text-xs text-gray-500",
    render: (m) => m.pedidoVenda.numero,
  },
  {
    id: "cliente",
    label: "Cliente",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 max-w-[220px]",
    render: (m) => (
      <div>
        <div className="font-medium text-gray-800 text-sm">
          {m.pedidoVenda.cliente.nomeFantasia || m.pedidoVenda.cliente.razaoSocial}
        </div>
        {m.pedidoVenda.cliente.nomeFantasia && (
          <div className="text-xs text-gray-400">{m.pedidoVenda.cliente.razaoSocial}</div>
        )}
      </div>
    ),
  },
  {
    id: "tipo",
    label: "Tipo",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-gray-600 text-sm",
    render: (m) => TIPO_MINUTA_LABEL[m.tipo] ?? "Entrega",
  },
  {
    id: "status",
    label: "Status",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3",
    render: (m) => <StatusBadge status={m.status} label={statusMinutaLabel(m.status, m.tipo)} />,
  },
  {
    id: "dataEmissao",
    label: "Emissão",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-gray-500 text-sm",
    render: (m) => formatDate(m.dataEmissao),
  },
  {
    id: "dataEntrega",
    label: "Prev. Entrega",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell",
    tdClass: "px-4 py-3 text-gray-500 text-sm hidden lg:table-cell",
    render: (m) => m.dataEntrega ? formatDate(m.dataEntrega) : "—",
  },
  {
    id: "motorista",
    label: "Motorista / Placa",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 hidden xl:table-cell",
    tdClass: "px-4 py-3 text-gray-500 text-sm hidden xl:table-cell",
    render: (m) => m.motorista
      ? <span>{m.motorista.nome}{m.placa && <span className="text-gray-400"> · {m.placa}</span>}</span>
      : <span className="text-gray-300">—</span>,
  },
  {
    id: "itens",
    label: "Itens",
    thClass: "text-center px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-center text-gray-500 text-sm",
    render: (m) => m.itens.length,
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
  const [open, setOpen]             = useState(false);
  const [showOpMenu, setShowOpMenu] = useState(false);
  const [mounted, setMounted]       = useState(false);
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

// ── Valid kanban transitions ──────────────────────────────────────────────────
const VALID_KANBAN_TRANSITIONS: Record<Minuta["status"], Minuta["status"][]> = {
  PENDENTE:          ["SAIU_PARA_ENTREGA", "CANCELADA"],
  SAIU_PARA_ENTREGA: ["ENTREGUE"],
  ENTREGUE:          [],
  CANCELADA:         [],
};

// ── Kanban card ───────────────────────────────────────────────────────────────
function MinutaKanbanCard({
  m, onClick, onDragStart, isDragging,
}: {
  m: Minuta;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  isDragging: boolean;
}) {
  const cliente = m.pedidoVenda.cliente;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        "bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-grab active:cursor-grabbing group select-none",
        isDragging && "opacity-40 scale-95",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="font-mono text-xs font-bold text-gray-800">{m.numero}</span>
        <span className="font-mono text-xs text-gray-400">{m.pedidoVenda.numero}</span>
      </div>
      <p className="text-xs text-gray-700 font-medium mb-2 leading-snug line-clamp-2">
        {cliente.nomeFantasia || cliente.razaoSocial}
      </p>
      <span className="inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 mb-2">
        {TIPO_MINUTA_LABEL[m.tipo] ?? "Entrega"}
      </span>
      {(m.motorista || m.placa) && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
          <Truck className="w-3 h-3 shrink-0" />
          <span className="truncate">
            {m.motorista?.nome}
            {m.placa && <span> · {m.placa}</span>}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
        <span className="text-xs text-gray-400">{m.itens.length} item{m.itens.length !== 1 ? "s" : ""}</span>
        {m.dataEntrega && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <CalendarDays className="w-3 h-3" />
            {formatDate(m.dataEntrega)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MinutasPage() {
  useTabTitle("Minutas");
  const router = useRouter();

  const [minutas, setMinutas] = useState<Minuta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(loadFilters);

  // ── Kanban drag state ─────────────────────────────────────────────────────
  const [draggingId,  setDraggingId]  = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [dragError,   setDragError]   = useState<string | null>(null);
  const dragCounter = useRef<Record<string, number>>({});

  // Column order + visibility
  const [colOrder, setColOrder]          = useColumnOrder("minutas", COLS.map((c) => c.id));
  const [colVis, setColVis, showAllCols] = useColumnVisibility("minutas", COLS.map((c) => c.id));
  const orderedCols = colOrder
    .map((id) => COLS.find((c) => c.id === id))
    .filter((c): c is ColDef<Minuta> => c !== undefined && colVis[c.id] !== false);

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
      const res = await fetch("/api/comercial/minutas");
      const json = await res.json();
      setMinutas(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Clear drag state if user drops outside any column
  useEffect(() => {
    function onDragEnd() {
      setDraggingId(null);
      setDragOverCol(null);
      dragCounter.current = {};
    }
    document.addEventListener("dragend", onDragEnd);
    return () => document.removeEventListener("dragend", onDragEnd);
  }, []);

  // ── Filtering + sorting ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase().trim();
    let list = minutas.filter((m) => {
      if (filters.statuses.length > 0) {
        if (filters.statusOp === "is"     && !filters.statuses.includes(m.status)) return false;
        if (filters.statusOp === "is_not" &&  filters.statuses.includes(m.status)) return false;
      }
      if (filters.dateFrom) {
        if (new Date(m.dataEmissao) < new Date(filters.dateFrom)) return false;
      }
      if (filters.dateTo) {
        if (new Date(m.dataEmissao) > new Date(filters.dateTo + "T23:59:59")) return false;
      }
      if (!q) return true;
      const cliente = m.pedidoVenda.cliente;
      return (
        m.numero.toLowerCase().includes(q) ||
        m.pedidoVenda.numero.toLowerCase().includes(q) ||
        (cliente.nomeFantasia ?? "").toLowerCase().includes(q) ||
        cliente.razaoSocial.toLowerCase().includes(q) ||
        (m.motorista?.nome ?? "").toLowerCase().includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      switch (filters.sortKey) {
        case "dataEmissao_asc":  return new Date(a.dataEmissao).getTime() - new Date(b.dataEmissao).getTime();
        case "dataEmissao_desc": return new Date(b.dataEmissao).getTime() - new Date(a.dataEmissao).getTime();
        case "numero_asc":       return a.numero.localeCompare(b.numero);
        default:                 return 0;
      }
    });

    return list;
  }, [minutas, filters]);

  // ── Kanban grouped ────────────────────────────────────────────────────────
  const kanbanGroups = useMemo(
    () => STATUS_COLS
      .map((col) => ({ ...col, items: filtered.filter((m) => m.status === col.key) }))
      .filter((col) => {
        if (filters.statuses.length === 0) return true;
        if (filters.statusOp === "is")     return  filters.statuses.includes(col.key);
        if (filters.statusOp === "is_not") return !filters.statuses.includes(col.key);
        return true;
      }),
    [filtered, filters.statuses, filters.statusOp]
  );

  const hasActive = filters.statuses.length > 0 || filters.search || filters.dateFrom || filters.dateTo;

  // ── PDF export ────────────────────────────────────────────────────────────
  async function downloadPDF() {
    const { default: jsPDF }     = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Minutas", 14, 16);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    const filterLabel = filters.statuses.length === 0
      ? "Todos os status"
      : filters.statuses.map((s) => STATUS_COLS.find((c) => c.key === s)?.label ?? s).join(", ");
    doc.text(`Filtro: ${filterLabel}${filters.search ? `  |  Busca: "${filters.search}"` : ""}`, 14, 22);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}  |  ${filtered.length} minuta(s)`, 14, 27);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 32,
      head: [["Minuta", "Pedido", "Cliente", "Tipo", "Status", "Emissão", "Prev. Entrega", "Motorista / Placa", "Itens"]],
      body: filtered.map((m) => [
        m.numero,
        m.pedidoVenda.numero,
        m.pedidoVenda.cliente.nomeFantasia || m.pedidoVenda.cliente.razaoSocial,
        TIPO_MINUTA_LABEL[m.tipo] ?? "Entrega",
        statusMinutaLabel(m.status, m.tipo),
        formatDate(m.dataEmissao),
        m.dataEntrega ? formatDate(m.dataEntrega) : "—",
        m.motorista ? `${m.motorista.nome}${m.placa ? ` · ${m.placa}` : ""}` : "—",
        String(m.itens.length),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 22, fontStyle: "bold" },
        1: { cellWidth: 22 },
        2: { cellWidth: 50 },
        3: { cellWidth: 18 },
        4: { cellWidth: 26 },
        5: { cellWidth: 22 },
        6: { cellWidth: 22 },
        7: { cellWidth: 42 },
        8: { cellWidth: 12, halign: "center" },
      },
      margin: { left: 14, right: 14 },
    });

    doc.save(`minutas-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  // ── Kanban drag handlers ──────────────────────────────────────────────────
  async function handleDrop(targetStatus: Minuta["status"]) {
    setDragOverCol(null);
    dragCounter.current = {};
    if (!draggingId) return;

    const minuta = minutas.find((m) => m.id === draggingId);
    setDraggingId(null);
    if (!minuta) return;
    if (minuta.status === targetStatus) return;

    const allowed = VALID_KANBAN_TRANSITIONS[minuta.status];
    if (!allowed.includes(targetStatus)) return;

    // Optimistic update
    setMinutas((prev) =>
      prev.map((m) => m.id === minuta.id ? { ...m, status: targetStatus } : m)
    );

    try {
      const res = await fetch(`/api/comercial/minutas/${minuta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Revert
        setMinutas((prev) =>
          prev.map((m) => m.id === minuta.id ? { ...m, status: minuta.status } : m)
        );
        setDragError(json.error ?? "Erro ao atualizar status");
        setTimeout(() => setDragError(null), 4000);
      }
    } catch {
      setMinutas((prev) =>
        prev.map((m) => m.id === minuta.id ? { ...m, status: minuta.status } : m)
      );
      setDragError("Erro de conexão");
      setTimeout(() => setDragError(null), 4000);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Minutas"
        breadcrumbs={[{ label: "Comercial" }, { label: "Minutas" }]}
        action={
          <Button asChild>
            <Link href="/comercial/minutas/nova">
              <Plus className="w-4 h-4 mr-2" />
              Nova Minuta
            </Link>
          </Button>
        }
      />

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="px-8 pb-4 flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Número, pedido, cliente..."
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

        {/* Limpar tudo */}
        {hasActive && (
          <button
            onClick={() => updateFilters({ search: "", statuses: [], statusOp: "is", dateFrom: "", dateTo: "" })}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors whitespace-nowrap"
          >
            Limpar tudo
          </button>
        )}

        {/* Results count */}
        <span className="text-xs text-gray-400">
          {loading ? "…" : `${filtered.length} minuta${filtered.length !== 1 ? "s" : ""}`}
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
          title="Baixar PDF das minutas filtradas"
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
          <span className="text-sm">Carregando minutas…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-2">
          <Truck className="w-8 h-8 text-gray-300" />
          <p className="text-sm font-medium">Nenhuma minuta encontrada</p>
          <p className="text-xs">Tente ajustar os filtros ou crie uma nova minuta.</p>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/comercial/minutas/${m.id}`)}
                  >
                    {orderedCols.map((col) => (
                      <td key={col.id} className={col.tdClass}>{col.render(m)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // ── Kanban view ────────────────────────────────────────────────────
        <div className="px-8 pb-8 flex-1 overflow-x-auto">
          {/* Drag error toast */}
          {dragError && (
            <div className="mb-3 flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
              <X className="w-4 h-4 shrink-0" />
              {dragError}
            </div>
          )}
          <div className="flex gap-4 min-w-max">
            {kanbanGroups.map((col) => {
              // Determine if this column is a valid drop target for the dragging card
              const draggingMinuta = draggingId ? minutas.find((m) => m.id === draggingId) : null;
              const isValidTarget = draggingMinuta
                ? VALID_KANBAN_TRANSITIONS[draggingMinuta.status].includes(col.key)
                : false;
              const isOver = dragOverCol === col.key && isValidTarget;

              return (
                <div
                  key={col.key}
                  className="w-72 flex-shrink-0"
                  onDragOver={(e) => {
                    if (isValidTarget) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    dragCounter.current[col.key] = (dragCounter.current[col.key] ?? 0) + 1;
                    if (isValidTarget) setDragOverCol(col.key);
                  }}
                  onDragLeave={() => {
                    dragCounter.current[col.key] = Math.max((dragCounter.current[col.key] ?? 1) - 1, 0);
                    if (dragCounter.current[col.key] === 0) setDragOverCol((p) => p === col.key ? null : p);
                  }}
                  onDrop={(e) => { e.preventDefault(); handleDrop(col.key); }}
                >
                  <div className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-t-xl border border-b-0 transition-colors",
                    isOver ? `${col.bg} ${col.border} ring-2 ring-inset ${col.border}` : `${col.bg} ${col.border}`,
                  )}>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs font-semibold uppercase tracking-wide", col.color)}>
                        {col.label}
                      </span>
                      <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded-full border", col.bg, col.color, col.border)}>
                        {col.items.length}
                      </span>
                    </div>
                    {/* Show indicator if dragging card can go here */}
                    {draggingId && isValidTarget && (
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", col.color, col.bg)}>
                        Soltar aqui
                      </span>
                    )}
                  </div>
                  <div className={cn(
                    "rounded-b-xl border min-h-[120px] p-2 space-y-2 transition-colors",
                    isOver
                      ? `bg-opacity-80 ${col.bg} ${col.border} ring-2 ring-inset ${col.border}`
                      : `bg-gray-50/60 ${col.border}`,
                    draggingId && isValidTarget && !isOver && "border-dashed",
                  )}>
                    {col.items.length === 0 && !isOver ? (
                      <div className={cn(
                        "flex items-center justify-center py-8 text-xs transition-colors",
                        draggingId && isValidTarget ? col.color + " opacity-50" : "text-gray-300",
                      )}>
                        {draggingId && isValidTarget ? "Solte aqui" : "Vazio"}
                      </div>
                    ) : isOver && col.items.length === 0 ? (
                      <div className={cn("flex items-center justify-center py-8 text-xs font-medium", col.color)}>
                        Solte aqui
                      </div>
                    ) : (
                      col.items.map((m) => (
                        <MinutaKanbanCard
                          key={m.id}
                          m={m}
                          isDragging={m.id === draggingId}
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", m.id);
                            setDraggingId(m.id);
                            dragCounter.current = {};
                          }}
                          onClick={() => { if (!draggingId) router.push(`/comercial/minutas/${m.id}`); }}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
