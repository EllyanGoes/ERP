"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL, formatDate, decimalToNumber, cn } from "@/lib/utils";
import PedidoActionsMenu from "./PedidoActionsMenu";
import { useColumnOrder } from "@/lib/use-column-order";
import ColumnConfigurator, { ColDef } from "@/components/shared/ColumnConfigurator";
import {
  Plus, Search, X, LayoutList, Kanban, Loader2,
  ChevronDown, ChevronRight, Calendar, Building2, ClipboardList, FileText,
  CheckCircle2, AlertCircle, ExternalLink,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Pedido = {
  id: string;
  numero: string;
  status: string;
  descricao: string | null;
  valorTotal: unknown;
  dataEntregaPrevista: string | null;
  createdAt: string;
  fornecedor: { razaoSocial: string; nomeFantasia: string | null };
  cotacao: {
    id: string; numero: string;
    necessidade: {
      id: string; numero: string; solicitante: string | null;
      justificativa: string | null;
      centroCusto: { nome: string } | null;
      localEstoque: { nome: string } | null;
    } | null;
  } | null;
  _count: { itens: number };
};

// ── Constants ─────────────────────────────────────────────────────────────────
const FILTER_KEY = "erp:pedidos-compra:filters:v1";

const KANBAN_TRANSITIONS: Record<string, string[]> = {
  AGUARDANDO_PAGAMENTO: ["EM_TRANSITO", "CANCELADO"],
  EM_TRANSITO:          ["CONFIRMADO",  "CANCELADO"],
  CONFIRMADO:           [],
  CANCELADO:            [],
  RASCUNHO:             ["AGUARDANDO_PAGAMENTO", "CANCELADO"],
  ENVIADO:              ["AGUARDANDO_PAGAMENTO", "CANCELADO"],
};

const STATUS_COLS: { key: string; label: string; color: string; bg: string; border: string }[] = [
  { key: "AGUARDANDO_PAGAMENTO", label: "Aguard. Pagamento", color: "text-yellow-700", bg: "bg-yellow-50",  border: "border-yellow-200" },
  { key: "EM_TRANSITO",          label: "Em Trânsito",       color: "text-amber-600",  bg: "bg-amber-50",   border: "border-amber-200"  },
  { key: "CONFIRMADO",           label: "Confirmado",        color: "text-green-700",  bg: "bg-green-50",   border: "border-green-200"  },
  { key: "CANCELADO",            label: "Cancelado",         color: "text-red-500",    bg: "bg-red-50",     border: "border-red-200"    },
];

const ALL_STATUSES = STATUS_COLS.map((s) => s.key);

// ── Column definitions ────────────────────────────────────────────────────────
const COLS: ColDef<Pedido>[] = [
  {
    id: "numero",
    label: "Número",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 font-mono text-xs font-medium text-gray-900",
    render: (p) => p.numero,
  },
  {
    id: "fornecedor",
    label: "Fornecedor",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-gray-700 max-w-[200px]",
    render: (p) => <span className="line-clamp-1">{p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial}</span>,
  },
  {
    id: "descricao",
    label: "Descrição",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell",
    tdClass: "px-4 py-3 hidden md:table-cell max-w-[220px]",
    render: (p) => {
      const texto = p.descricao ?? p.cotacao?.necessidade?.justificativa ?? null;
      return texto
        ? <span className="line-clamp-2 text-xs text-gray-600">{texto}</span>
        : <span className="text-gray-300 text-xs">—</span>;
    },
  },
  {
    id: "sc",
    label: "SC / Solicitante",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell",
    tdClass: "px-4 py-3 hidden md:table-cell",
    render: (p) => {
      const sc = p.cotacao?.necessidade;
      const setor = sc?.centroCusto?.nome ?? sc?.localEstoque?.nome ?? null;
      return sc ? (
        <Link
          href={`/compras/necessidades/${sc.id}`}
          onClick={(e) => e.stopPropagation()}
          className="group flex flex-col gap-0.5"
        >
          <span className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline">
            <ClipboardList className="w-3 h-3 flex-shrink-0" />
            {sc.numero}
            <ChevronRight className="w-3 h-3 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </span>
          {(sc.solicitante || setor) && (
            <span className="text-xs text-gray-400 pl-4">
              {[setor, sc.solicitante].filter(Boolean).join(" · ")}
            </span>
          )}
        </Link>
      ) : (
        <span className="text-xs text-gray-300">—</span>
      );
    },
  },
  {
    id: "cotacao",
    label: "Cotação",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell",
    tdClass: "px-4 py-3 hidden lg:table-cell",
    render: (p) =>
      p.cotacao ? (
        <Link
          href={`/suprimentos/cotacoes/${p.cotacao.id}`}
          onClick={(e) => e.stopPropagation()}
          className="group flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
        >
          <FileText className="w-3 h-3 flex-shrink-0" />
          {p.cotacao.numero}
          <ChevronRight className="w-3 h-3 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      ) : (
        <span className="text-xs text-gray-300">—</span>
      ),
  },
  {
    id: "status",
    label: "Status",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3",
    render: (p) => <StatusBadge status={p.status} />,
  },
  {
    id: "valorTotal",
    label: "Valor Total",
    thClass: "text-right px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-right font-medium text-gray-900",
    render: (p) =>
      decimalToNumber(p.valorTotal) > 0
        ? formatBRL(decimalToNumber(p.valorTotal))
        : "—",
  },
  {
    id: "entregaPrevista",
    label: "Entrega Prevista",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell",
    tdClass: "px-4 py-3 text-gray-500 text-xs hidden lg:table-cell",
    render: (p) => p.dataEntregaPrevista ? formatDate(p.dataEntregaPrevista) : "—",
  },
];

// ── Persist helpers ───────────────────────────────────────────────────────────
type Filters = { search: string; statuses: string[]; view: "list" | "kanban" };

function loadFilters(): Filters {
  if (typeof window === "undefined") return { search: "", statuses: ALL_STATUSES, view: "list" };
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) {
      const f = JSON.parse(raw) as Filters;
      return {
        search:   f.search   ?? "",
        statuses: Array.isArray(f.statuses) && f.statuses.length ? f.statuses : ALL_STATUSES,
        view:     f.view === "kanban" ? "kanban" : "list",
      };
    }
  } catch {}
  return { search: "", statuses: ALL_STATUSES, view: "list" };
}

function saveFilters(f: Filters) {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch {}
}

// ── Kanban card ───────────────────────────────────────────────────────────────
function KanbanCard({
  p,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  p: Pedido;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const sc = p.cotacao?.necessidade;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", p.id);
        onDragStart(p.id);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "bg-white border rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md hover:border-blue-300 transition-all group select-none",
        isDragging ? "opacity-40 border-blue-400 shadow-lg scale-95" : "border-gray-200"
      )}
      onClick={() => !isDragging && window.open(`/suprimentos/pedidos-compra/${p.id}`, "_blank")}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-mono text-xs font-semibold text-gray-800">{p.numero}</span>
        <div onClick={(e) => e.stopPropagation()}>
          <PedidoActionsMenu id={p.id} numero={p.numero} status={p.status} />
        </div>
      </div>

      <p className="text-xs text-gray-700 font-medium mb-1 leading-snug line-clamp-2">
        {p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial}
      </p>

      {sc && (
        <Link
          href={`/compras/necessidades/${sc.id}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline mb-0.5"
        >
          <ClipboardList className="w-3 h-3" />
          {sc.numero}
          {sc.solicitante && <span className="text-gray-400">· {sc.solicitante}</span>}
        </Link>
      )}
      {p.cotacao && (
        <Link
          href={`/suprimentos/cotacoes/${p.cotacao.id}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 hover:underline mb-1"
        >
          <FileText className="w-3 h-3" />
          {p.cotacao.numero}
        </Link>
      )}

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
        <span className="text-xs font-semibold text-gray-900">
          {formatBRL(decimalToNumber(p.valorTotal))}
        </span>
        {p.dataEntregaPrevista && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Calendar className="w-3 h-3" />
            {formatDate(p.dataEntregaPrevista)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Toast type ────────────────────────────────────────────────────────────────
type Toast = {
  id: number;
  type: "success" | "error";
  message: string;
  link?: { href: string; label: string };
};

// ── Confirm dialog type ───────────────────────────────────────────────────────
type ConfirmMove = { pedidoId: string; toStatus: string };

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PedidosCompraPage() {
  const [pedidos, setPedidos]   = useState<Pedido[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filters, setFilters]   = useState<Filters>(loadFilters);

  // Column order
  const [colOrder, setColOrder] = useColumnOrder("pedidos-compra", COLS.map((c) => c.id));
  const orderedCols = colOrder.map((id) => COLS.find((c) => c.id === id)).filter((c): c is ColDef<Pedido> => c !== undefined);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  // Drag state
  const [dragId,   setDragId]   = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragCounter             = useRef<Record<string, number>>({});

  // Toast
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq            = useRef(0);

  // Confirm move (for CANCELADO)
  const [confirmMove, setConfirmMove] = useState<ConfirmMove | null>(null);

  function pushToast(t: Omit<Toast, "id">, durationMs = 5000) {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), durationMs);
  }

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
      const res = await fetch("/api/suprimentos/pedidos-compra");
      const json = await res.json();
      setPedidos(Array.isArray(json.data) ? json.data : []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Kanban drag helpers ───────────────────────────────────────────────────
  async function moveCard(pedidoId: string, toStatus: string) {
    // Optimistic update
    setPedidos((prev) =>
      prev.map((p) => (p.id === pedidoId ? { ...p, status: toStatus } : p))
    );

    try {
      const res = await fetch(`/api/suprimentos/pedidos-compra/${pedidoId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: toStatus }),
      });
      const json = await res.json();

      if (!res.ok) {
        // Revert
        await load();
        pushToast({ type: "error", message: json.error ?? "Erro ao mover pedido." });
        return;
      }

      const { conferenciaCreated, conferenciaId, conferenciaNumero } = json.data ?? {};

      if (toStatus === "CONFIRMADO" && conferenciaCreated) {
        pushToast({
          type: "success",
          message: `Doc. de Entrada ${conferenciaNumero} criado automaticamente.`,
          link: { href: `/suprimentos/conferencias/${conferenciaId}`, label: "Abrir" },
        });
      } else if (toStatus === "CONFIRMADO") {
        pushToast({
          type: "success",
          message: `Pedido confirmado. Doc. de Entrada ${conferenciaNumero ?? ""} já existia.`,
          link: conferenciaId
            ? { href: `/suprimentos/conferencias/${conferenciaId}`, label: "Abrir" }
            : undefined,
        });
      } else if (toStatus === "CANCELADO") {
        pushToast({ type: "success", message: "Pedido cancelado." });
      } else {
        const col = STATUS_COLS.find((c) => c.key === toStatus);
        pushToast({ type: "success", message: `Status atualizado para "${col?.label ?? toStatus}".` });
      }
    } catch {
      await load();
      pushToast({ type: "error", message: "Falha de conexão ao mover pedido." });
    }
  }

  function handleDrop(colKey: string) {
    if (!dragId) return;
    const pedido = pedidos.find((p) => p.id === dragId);
    if (!pedido) return;

    // Same column — no-op
    if (pedido.status === colKey) {
      setDragId(null);
      setDragOver(null);
      return;
    }

    // Validate transition
    const allowed = KANBAN_TRANSITIONS[pedido.status] ?? [];
    if (!allowed.includes(colKey)) {
      pushToast({ type: "error", message: `Transição "${pedido.status} → ${colKey}" não permitida.` });
      setDragId(null);
      setDragOver(null);
      return;
    }

    if (colKey === "CANCELADO") {
      // Ask confirmation before cancelling
      setConfirmMove({ pedidoId: dragId, toStatus: colKey });
    } else {
      moveCard(dragId, colKey);
    }

    setDragId(null);
    setDragOver(null);
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase().trim();
    return pedidos.filter((p) => {
      if (!filters.statuses.includes(p.status)) return false;
      if (!q) return true;
      const sc = p.cotacao?.necessidade;
      return (
        p.numero.toLowerCase().includes(q) ||
        (p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial).toLowerCase().includes(q) ||
        (p.cotacao?.numero ?? "").toLowerCase().includes(q) ||
        (sc?.numero ?? "").toLowerCase().includes(q) ||
        (sc?.solicitante ?? "").toLowerCase().includes(q)
      );
    });
  }, [pedidos, filters]);

  const activeStatusLabel = useMemo(() => {
    if (filters.statuses.length === ALL_STATUSES.length) return "Todos os status";
    if (filters.statuses.length === 0) return "Nenhum status";
    if (filters.statuses.length === 1)
      return STATUS_COLS.find((s) => s.key === filters.statuses[0])?.label ?? "1 status";
    return `${filters.statuses.length} status`;
  }, [filters.statuses]);

  // ── Kanban grouped ────────────────────────────────────────────────────────
  const kanbanGroups = useMemo(
    () => STATUS_COLS.map((col) => ({
      ...col,
      items: filtered.filter((p) => p.status === col.key),
    })).filter((col) => filters.statuses.includes(col.key)),
    [filtered, filters.statuses]
  );

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Pedidos de Compra"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Pedidos de Compra" }]}
        action={
          <Button asChild>
            <Link href="/suprimentos/pedidos-compra/novo">
              <Plus className="w-4 h-4 mr-2" />
              Novo Pedido Manual
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
            placeholder="Buscar número, fornecedor, SC…"
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

        {/* Results count */}
        <span className="text-xs text-gray-400">
          {loading ? "…" : `${filtered.length} pedido${filtered.length !== 1 ? "s" : ""}`}
        </span>

        {/* Column configurator — only relevant for list view */}
        {filters.view === "list" && (
          <ColumnConfigurator columns={COLS} order={colOrder} onOrderChange={setColOrder} />
        )}

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
          <Building2 className="w-8 h-8 text-gray-300" />
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
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => window.open(`/suprimentos/pedidos-compra/${p.id}`, "_blank")}
                  >
                    {orderedCols.map((col) => (
                      <td key={col.id} className={col.tdClass}>{col.render(p)}</td>
                    ))}
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <PedidoActionsMenu id={p.id} numero={p.numero} status={p.status} />
                    </td>
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
              const isOver    = dragOver === col.key;
              const dragPedido = dragId ? pedidos.find((p) => p.id === dragId) : null;
              const canDrop   = dragPedido
                ? (KANBAN_TRANSITIONS[dragPedido.status] ?? []).includes(col.key)
                : false;

              return (
                <div key={col.key} className="w-72 flex-shrink-0">
                  {/* Column header */}
                  <div className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-t-xl border border-b-0 transition-colors",
                    col.bg, col.border
                  )}>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs font-semibold uppercase tracking-wide", col.color)}>
                        {col.label}
                      </span>
                      <span className={cn(
                        "text-xs font-medium px-1.5 py-0.5 rounded-full",
                        col.bg, col.color, "border", col.border
                      )}>
                        {col.items.length}
                      </span>
                    </div>
                    {col.items.length > 0 && (
                      <span className="text-xs text-gray-500">
                        {formatBRL(col.items.reduce((s, p) => s + decimalToNumber(p.valorTotal), 0))}
                      </span>
                    )}
                  </div>

                  {/* Column body — drop target */}
                  <div
                    className={cn(
                      "rounded-b-xl border min-h-[120px] p-2 space-y-2 transition-all duration-150",
                      col.border,
                      isOver && canDrop
                        ? "bg-blue-50 border-blue-400 ring-2 ring-blue-300 ring-inset"
                        : isOver && !canDrop
                        ? "bg-red-50 border-red-300"
                        : "bg-gray-50/60"
                    )}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = canDrop ? "move" : "none";
                      if (dragOver !== col.key) setDragOver(col.key);
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      dragCounter.current[col.key] = (dragCounter.current[col.key] ?? 0) + 1;
                      setDragOver(col.key);
                    }}
                    onDragLeave={() => {
                      dragCounter.current[col.key] = Math.max(0, (dragCounter.current[col.key] ?? 1) - 1);
                      if (dragCounter.current[col.key] === 0) {
                        setDragOver((prev) => (prev === col.key ? null : prev));
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      dragCounter.current[col.key] = 0;
                      handleDrop(col.key);
                    }}
                  >
                    {col.items.length === 0 ? (
                      <div className={cn(
                        "flex items-center justify-center py-8 text-xs",
                        isOver && canDrop ? "text-blue-400" : "text-gray-300"
                      )}>
                        {isOver && canDrop ? "Soltar aqui" : "Vazio"}
                      </div>
                    ) : (
                      col.items.map((p) => (
                        <KanbanCard
                          key={p.id}
                          p={p}
                          isDragging={dragId === p.id}
                          onDragStart={setDragId}
                          onDragEnd={() => { setDragId(null); setDragOver(null); }}
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

      {/* ── Toasts ────────────────────────────────────────────────────────── */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg text-sm text-white pointer-events-auto max-w-lg animate-in fade-in slide-in-from-bottom-2",
              t.type === "success" ? "bg-emerald-700" : "bg-red-600"
            )}
          >
            {t.type === "success"
              ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : <AlertCircle  className="w-4 h-4 shrink-0" />}
            <span>{t.message}</span>
            {t.link && (
              <Link
                href={t.link.href}
                className="flex items-center gap-1 underline underline-offset-2 font-medium opacity-90 hover:opacity-100 ml-1"
              >
                {t.link.label}
                <ExternalLink className="w-3 h-3" />
              </Link>
            )}
            <button
              className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* ── Confirm dialog (CANCELADO) ─────────────────────────────────────── */}
      {confirmMove && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmMove(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Cancelar pedido?</h3>
            <p className="text-sm text-gray-500 mb-5">
              Esta ação irá marcar o pedido como <strong>Cancelado</strong>. Deseja continuar?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                onClick={() => setConfirmMove(null)}
              >
                Não, manter
              </button>
              <button
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                onClick={() => {
                  if (confirmMove) moveCard(confirmMove.pedidoId, confirmMove.toStatus);
                  setConfirmMove(null);
                }}
              >
                Sim, cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
