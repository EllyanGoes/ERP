"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePersistedFilters } from "@/lib/use-persisted-filters";
import PageHeader from "@/components/shared/PageHeader";
import FilterDropdown, { FilterOption } from "@/components/shared/FilterDropdown";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import {
  Plus, Search, X, Loader2, TrendingUp, TrendingDown,
  ChevronDown, ChevronRight, Trash2, AlertTriangle, Info, Pencil, Save, RefreshCw,
} from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { LocalEstoqueQuickCreate } from "@/components/shared/QuickCreateDialogs";
import { cn } from "@/lib/utils";
import { useColumnOrder } from "@/lib/use-column-order";
import ColumnConfigurator, { ColDef } from "@/components/shared/ColumnConfigurator";

// ── Types ──────────────────────────────────────────────────────────────────────
type MovItem = {
  id: string;
  quantidade: unknown;
  valorUnitario: unknown;
  saldoAntes: unknown;
  saldoDepois: unknown;
  documento: string | null;
  observacoes: string | null;
  pedidoVendaItemId: string | null;
  conferenciaItemId: string | null;
  item: { id: string; codigo: string; descricao: string; unidadeMedida: string; unidade: { sigla: string } | null };
  localEstoque: { id: string; nome: string } | null;
};

type Lote = {
  id: string;
  numero: string;
  tipo: "ENTRADA" | "SAIDA";
  documento: string | null;
  observacoes: string | null;
  createdAt: string;
  itens: MovItem[];
};

type ItemOpt       = { id: string; codigo: string; descricao: string };
type LocalEstoque  = { id: string; nome: string };
type FornecedorOpt = { id: string; razaoSocial: string; nomeFantasia: string | null };
type UnidadeOption = { id: string; sigla: string; nome: string; isPrincipal: boolean };

type LinhaItem = {
  key: number;
  itemId: string;
  unidade: string;
  quantidade: string;
  valorUnitario: string;
  observacoes: string;
  stockInfo: { exists: boolean; quantidadeAtual: number } | null;
  stockLoading: boolean;
};

// ── Column definitions (inner items table) ────────────────────────────────────
// isEntrada is needed in some render fns — handled via module-level variable
let _movIsEntrada = false;

const MOV_COLS: ColDef<MovItem>[] = [
  {
    id: "codigo",
    label: "Código",
    thClass: "text-left px-6 py-2 font-medium",
    tdClass: "px-6 py-2.5",
    render: (it) => (
      <Link href={`/suprimentos/produtos/${it.item.id}`} className="font-mono text-xs text-blue-600 hover:underline">
        {it.item.codigo}
      </Link>
    ),
  },
  {
    id: "descricao",
    label: "Descrição",
    thClass: "text-left px-4 py-2 font-medium",
    tdClass: "px-4 py-2.5 text-gray-800",
    render: (it) => it.item.descricao,
  },
  {
    id: "local",
    label: "Local",
    thClass: "text-left px-4 py-2 font-medium",
    tdClass: "px-4 py-2.5 text-xs text-gray-500",
    render: (it) => it.localEstoque?.nome ?? <span className="text-gray-300">—</span>,
  },
  {
    id: "quantidade",
    label: "Quantidade",
    thClass: "text-right px-4 py-2 font-medium",
    tdClass: "px-4 py-2.5 text-right font-semibold",
    render: (it) => {
      const isEntra = _movIsEntrada;
      const un = it.item.unidade?.sigla || it.item.unidadeMedida;
      return (
        <span className={isEntra ? "text-emerald-600" : "text-red-600"}>
          {isEntra ? "+" : "−"}{toNum(it.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
          <span className="text-xs font-normal text-gray-400 ml-1">{un}</span>
        </span>
      );
    },
  },
  {
    id: "custoUnit",
    label: "Custo Unit.",
    thClass: "text-right px-4 py-2 font-medium",
    tdClass: "px-4 py-2.5 text-right text-xs text-gray-500",
    render: (it) => {
      const vUnit = it.valorUnitario ? toNum(it.valorUnitario) : null;
      return vUnit !== null
        ? vUnit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : <span className="text-gray-300">—</span>;
    },
  },
  {
    id: "saldoAntes",
    label: "Saldo Antes",
    thClass: "text-right px-4 py-2 font-medium",
    tdClass: "px-4 py-2.5 text-right text-gray-400 text-xs",
    render: (it) => toNum(it.saldoAntes).toLocaleString("pt-BR", { maximumFractionDigits: 3 }),
  },
  {
    id: "saldoDepois",
    label: "Saldo Depois",
    thClass: "text-right px-4 py-2 font-medium",
    tdClass: "px-4 py-2.5 text-right text-gray-700 text-sm font-medium",
    render: (it) => toNum(it.saldoDepois).toLocaleString("pt-BR", { maximumFractionDigits: 3 }),
  },
  {
    id: "origem",
    label: "Origem",
    thClass: "text-left px-4 py-2 font-medium",
    tdClass: "px-4 py-2.5",
    render: (it) =>
      it.pedidoVendaItemId || it.conferenciaItemId ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
          <RefreshCw className="w-3 h-3" />Auto
        </span>
      ) : (
        <span className="text-xs text-gray-400">Manual</span>
      ),
  },
  {
    id: "obs",
    label: "Obs.",
    thClass: "text-left px-4 py-2 font-medium",
    tdClass: "px-4 py-2.5 text-xs text-gray-400 max-w-[140px] truncate",
    render: (it) => it.observacoes || "—",
  },
];

// ── Constants ─────────────────────────────────────────────────────────────────
const TIPO_FILTER_OPTIONS: FilterOption[] = [
  { key: "todos",   label: "Todos",   color: "bg-gray-100 text-gray-600" },
  { key: "ENTRADA", label: "Entrada", color: "bg-emerald-100 text-emerald-700" },
  { key: "SAIDA",   label: "Saída",   color: "bg-red-100 text-red-700" },
];

const ORIGEM_FILTER_OPTIONS: FilterOption[] = [
  { key: "todos",       label: "Todas",     color: "bg-gray-100 text-gray-600" },
  { key: "manual",      label: "Manual",    color: "bg-gray-100 text-gray-600" },
  { key: "automatica",  label: "Automática", color: "bg-purple-100 text-purple-700" },
];

function toNum(v: unknown) { return parseFloat(String(v ?? 0)); }
let nextKey = 1;
function newLinha(): LinhaItem {
  return { key: nextKey++, itemId: "", unidade: "", quantidade: "", valorUnitario: "", observacoes: "", stockInfo: null, stockLoading: false };
}

// ── UnitSelect ────────────────────────────────────────────────────────────────
function UnitSelect({ value, options, onChange, disabled }: {
  value: string; options: UnidadeOption[]; onChange: (v: string) => void; disabled?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);

  function calcPos() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    if (spaceBelow < 180 && spaceAbove > spaceBelow) {
      setPos({ bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width });
    } else {
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }

  useEffect(() => {
    if (!open) return;
    calcPos();
    window.addEventListener("scroll", calcPos, true);
    window.addEventListener("resize", calcPos);
    return () => { window.removeEventListener("scroll", calcPos, true); window.removeEventListener("resize", calcPos); };
  }, [open]);

  if (disabled || options.length === 0) {
    return (
      <div className="h-8 flex items-center px-2 text-sm border border-gray-100 rounded-md bg-gray-50 font-mono text-gray-500">
        {value || "—"}
      </div>
    );
  }
  if (options.length === 1) {
    return (
      <div className="h-8 flex items-center px-2 text-sm border border-gray-100 rounded-md bg-gray-50 font-mono text-gray-700">
        {value || options[0].sigla}
      </div>
    );
  }

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen((p) => !p)}
        className={cn(
          "h-8 w-full flex items-center justify-between px-2 text-sm border border-gray-200 rounded-md bg-white font-mono transition-colors hover:border-gray-300",
          open && "border-blue-400 ring-1 ring-blue-200"
        )}>
        <span className={value ? "text-gray-800" : "text-gray-400"}>{value || "Un."}</span>
        <ChevronDown className={cn("w-3 h-3 text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && typeof window !== "undefined" && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          {pos && (
            <div className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg overflow-auto"
              style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: Math.max(pos.width, 140), maxHeight: 180 }}>
              {options.map((u) => (
                <button key={u.id} type="button" onClick={() => { onChange(u.sigla); setOpen(false); }}
                  className={cn(
                    "w-full px-3 py-2 text-sm text-left hover:bg-blue-50 hover:text-blue-700 transition-colors font-mono",
                    value === u.sigla && "bg-blue-50 text-blue-700 font-medium"
                  )}>
                  <span className="font-bold">{u.sigla}</span>
                  {u.nome && <span className="text-gray-400 ml-1.5 text-xs font-sans">{u.nome}</span>}
                  {u.isPrincipal && <span className="ml-1.5 text-[10px] text-emerald-600">principal</span>}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function MovimentacoesPage() {
  // Default period: 1 Jan of current year → today
  const currentYear = new Date().getFullYear();
  const defaultRange: DateRange = {
    from: `${currentYear}-01-01`,
    to:   new Date().toISOString().slice(0, 10),
  };

  const [lotes, setLotes]       = useState<Lote[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState("");
  // Filters — persisted per user
  const [f, setF] = usePersistedFilters("movimentacoes", {
    search:      "",
    tipoFilter:  "todos",
    localFilter: "todos",
    origemFilter: "todos",
    dateRange:   defaultRange as DateRange,
  });
  const { search, tipoFilter, localFilter, origemFilter, dateRange } = f;
  const setSearch       = (v: string)    => setF({ search: v });
  const setTipoFilter   = (v: string)    => setF({ tipoFilter: v });
  const setLocalFilter  = (v: string)    => setF({ localFilter: v });
  const setOrigemFilter = (v: string)    => setF({ origemFilter: v });
  const setDateRange    = (v: DateRange) => setF({ dateRange: v });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [itemList, setItemList]   = useState<ItemOpt[]>([]);
  const [locais, setLocais]       = useState<LocalEstoque[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorOpt[]>([]);
  const [tipoMov, setTipoMov]     = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const [localEstoqueId, setLocalEstoqueId] = useState("");
  const [fornecedorId, setFornecedorId]     = useState("");
  const [documento, setDocumento] = useState("");
  const [obsGeral, setObsGeral]   = useState("");
  const [linhas, setLinhas]       = useState<LinhaItem[]>([newLinha()]);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Auto-link toast
  const [autoVinculoMsg, setAutoVinculoMsg] = useState<string | null>(null);
  // Map itemId → list of units registered for that product (cached)
  const [itemUnidades, setItemUnidades] = useState<Map<string, UnidadeOption[]>>(new Map());

  // ── Edit / Delete movement item ─────────────────────────────────────────────
  const [editMov, setEditMov]       = useState<MovItem | null>(null);
  const [editMovForm, setEditMovForm] = useState({ documento: "", observacoes: "" });
  const [editMovSaving, setEditMovSaving] = useState(false);
  const [editMovError, setEditMovError]   = useState("");

  const [deleteMov, setDeleteMov]         = useState<MovItem | null>(null);
  const [deleteMovLoading, setDeleteMovLoading] = useState(false);
  const [deleteMovError, setDeleteMovError]     = useState("");

  // ── Data loading ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res    = await fetch("/api/suprimentos/movimentacoes?take=500");
      const result = await res.json();
      if (!res.ok) { setLoadError(result.error || "Erro ao carregar"); setLotes([]); return; }
      setLotes(result.data ?? []);
    } catch {
      setLoadError("Erro de conexão");
      setLotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    Promise.all([
      fetch("/api/suprimentos/produtos").then((r) => r.json()),
      fetch("/api/suprimentos/locais-estoque").then((r) => r.json()),
      fetch("/api/suprimentos/fornecedores").then((r) => r.json()),
    ]).then(([prods, locs, forns]) => {
      setItemList(prods.data ?? []);
      setLocais(Array.isArray(locs) ? locs : (locs.data ?? []));
      setFornecedores(Array.isArray(forns) ? forns : (forns.data ?? []));
    });
  }, []);

  // ── Stock check per linha ────────────────────────────────────────────────────
  async function checkStock(key: number, itemId: string, localEstoqueId: string) {
    if (!itemId || !localEstoqueId) return;
    setLinhas((prev) => prev.map((l) => l.key === key ? { ...l, stockLoading: true } : l));
    const params = new URLSearchParams({ itemId, localEstoqueId });
    const j = await fetch(`/api/estoque/check?${params}`).then((r) => r.json());
    setLinhas((prev) => prev.map((l) => l.key === key ? { ...l, stockInfo: j, stockLoading: false } : l));
  }

  // Fetch + cache units for a given product
  async function fetchItemUnidades(itemId: string) {
    if (!itemId || itemUnidades.has(itemId)) return itemUnidades.get(itemId) ?? [];
    const res  = await fetch(`/api/suprimentos/produtos/${itemId}/unidades`);
    const json = await res.json();
    const list: UnidadeOption[] = Array.isArray(json)
      ? json.map((u: { unidade: { id: string; sigla: string; nome: string }; isPrincipal: boolean }) => ({
          id: u.unidade.id, sigla: u.unidade.sigla, nome: u.unidade.nome, isPrincipal: u.isPrincipal,
        }))
      : [];
    setItemUnidades((prev) => new Map(prev).set(itemId, list));
    return list;
  }

  function updateLinha(key: number, patch: Partial<LinhaItem>) {
    setLinhas((prev) => {
      const updated = prev.map((l) => l.key === key ? { ...l, ...patch } : l);
      // Trigger stock check when itemId changes (local is now at movement level)
      const linha = updated.find((l) => l.key === key);
      if (linha && patch.itemId !== undefined) {
        if (linha.itemId && localEstoqueId) {
          checkStock(key, linha.itemId, localEstoqueId);
        } else {
          return updated.map((l) => l.key === key ? { ...l, stockInfo: null } : l);
        }
        // Fetch units for new item and auto-set principal/first unit
        if (linha.itemId) {
          fetchItemUnidades(linha.itemId).then((units) => {
            if (!units || units.length === 0) return;
            const principal = units.find((u) => u.isPrincipal) ?? units[0];
            setLinhas((p) => p.map((l) => l.key === key && !l.unidade ? { ...l, unidade: principal.sigla } : l));
          });
        } else {
          return updated.map((l) => l.key === key ? { ...l, unidade: "", stockInfo: null } : l);
        }
      }
      return updated;
    });
  }

  function handleLocalEstoqueChange(v: string) {
    setLocalEstoqueId(v);
    if (v) {
      // Re-check stock for all items that already have an itemId
      linhas.forEach((l) => {
        if (l.itemId) checkStock(l.key, l.itemId, v);
        else setLinhas((p) => p.map((ll) => ll.key === l.key ? { ...ll, stockInfo: null } : ll));
      });
    } else {
      setLinhas((p) => p.map((l) => ({ ...l, stockInfo: null })));
    }
  }

  function addLinha()         { setLinhas((p) => [...p, newLinha()]); }
  function removeLinha(key: number) { setLinhas((p) => p.filter((l) => l.key !== key)); }

  function resetModal() {
    setTipoMov("ENTRADA"); setLocalEstoqueId(""); setFornecedorId(""); setDocumento(""); setObsGeral("");
    setLinhas([newLinha()]); setFormError("");
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!localEstoqueId) { setFormError("Selecione o local de estoque."); return; }
    const valid = linhas.filter((l) => l.itemId && parseFloat(l.quantidade) > 0);
    if (valid.length === 0) { setFormError("Adicione ao menos um item com produto e quantidade."); return; }
    setSubmitting(true); setFormError("");
    try {
      const res = await fetch("/api/suprimentos/movimentacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo:         tipoMov,
          documento:    documento   || undefined,
          observacoes:  obsGeral    || undefined,
          fornecedorId: tipoMov === "ENTRADA" && fornecedorId ? fornecedorId : undefined,
          itens: valid.map((l) => ({
            itemId:         l.itemId,
            localEstoqueId: localEstoqueId,
            quantidade:     parseFloat(l.quantidade),
            valorUnitario:  tipoMov === "ENTRADA" && l.valorUnitario ? parseFloat(l.valorUnitario) : undefined,
            observacoes:    l.observacoes || undefined,
          })),
        }),
      });
      if (!res.ok) { setFormError((await res.json()).error || "Erro ao registrar"); return; }
      const result = await res.json();
      setShowModal(false); resetModal(); await load();
      if (result.autoVinculos?.length > 0) {
        setAutoVinculoMsg(
          `Vinculação automática: ${result.autoVinculos.join(", ")} ${result.autoVinculos.length === 1 ? "foi vinculado" : "foram vinculados"} ao fornecedor selecionado.`
        );
        setTimeout(() => setAutoVinculoMsg(null), 7000);
      }
    } catch { setFormError("Erro de conexão"); }
    finally { setSubmitting(false); }
  }

  // ── Edit / Delete handlers ──────────────────────────────────────────────────
  function openEditMov(mov: MovItem) {
    setEditMov(mov);
    setEditMovForm({ documento: mov.documento ?? "", observacoes: mov.observacoes ?? "" });
    setEditMovError("");
  }

  async function submitEditMov() {
    if (!editMov) return;
    setEditMovSaving(true); setEditMovError("");
    try {
      const res = await fetch(`/api/suprimentos/movimentacoes/${editMov.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documento:   editMovForm.documento   || null,
          observacoes: editMovForm.observacoes || null,
        }),
      });
      if (!res.ok) { setEditMovError((await res.json()).error || "Erro ao salvar"); return; }
      setEditMov(null);
      await load();
    } catch { setEditMovError("Erro de conexão"); }
    finally  { setEditMovSaving(false); }
  }

  async function confirmDeleteMov() {
    if (!deleteMov) return;
    setDeleteMovLoading(true); setDeleteMovError("");
    try {
      const res = await fetch(`/api/suprimentos/movimentacoes/${deleteMov.id}`, { method: "DELETE" });
      if (!res.ok) { setDeleteMovError((await res.json()).error || "Erro ao excluir"); return; }
      setDeleteMov(null);
      await load();
    } catch { setDeleteMovError("Erro de conexão"); }
    finally  { setDeleteMovLoading(false); }
  }

  // ── Filtering ───────────────────────────────────────────────────────────────
  function handleSearch(val: string) {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {}, 200);
  }

  const filtered = lotes.filter((l) => {
    if (tipoFilter !== "todos" && l.tipo !== tipoFilter) return false;
    if (dateRange.from) {
      const d = new Date(l.createdAt);
      if (d < new Date(dateRange.from + "T00:00:00")) return false;
    }
    if (dateRange.to) {
      const d = new Date(l.createdAt);
      if (d > new Date(dateRange.to + "T23:59:59")) return false;
    }
    if (localFilter !== "todos") {
      const hasLocal = l.itens.some((i) => (i.localEstoque?.id ?? "__sem_local__") === localFilter);
      if (!hasLocal) return false;
    }
    if (origemFilter !== "todos") {
      if (loteOrigem(l.itens) !== origemFilter) return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      l.numero.toLowerCase().includes(q) ||
      (l.documento ?? "").toLowerCase().includes(q) ||
      l.itens.some((i) => i.item.codigo.toLowerCase().includes(q) || i.item.descricao.toLowerCase().includes(q))
    );
  });

  // Sort: most recent first (API already orders desc, but keep stable after filter)
  const sortedFiltered = [...filtered].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const totalEntradas = lotes.filter((l) => l.tipo === "ENTRADA").length;
  const totalSaidas   = lotes.filter((l) => l.tipo === "SAIDA").length;
  const isDefaultRange = dateRange.from === defaultRange.from && dateRange.to === defaultRange.to;
  const hasFilters    = search || tipoFilter !== "todos" || localFilter !== "todos" || origemFilter !== "todos" || !isDefaultRange;

  function loteOrigem(itens: MovItem[]): "manual" | "automatica" {
    return itens.some((i) => i.pedidoVendaItemId || i.conferenciaItemId) ? "automatica" : "manual";
  }

  // Build local filter options from the already-loaded locais list
  const LOCAL_FILTER_OPTIONS: FilterOption[] = [
    { key: "todos", label: "Todos os locais", color: "bg-gray-100 text-gray-600" },
    ...locais.map((l) => ({ key: l.id, label: l.nome, color: "bg-emerald-100 text-emerald-700" })),
  ];

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Stock alert per linha ────────────────────────────────────────────────────
  function linhaAlert(linha: LinhaItem) {
    if (!linha.itemId || !localEstoqueId) return null;
    if (linha.stockLoading) return (
      <span className="text-[10px] text-gray-400 flex items-center gap-1">
        <Loader2 className="w-2.5 h-2.5 animate-spin" /> verificando...
      </span>
    );
    if (!linha.stockInfo) return null;
    const { exists, quantidadeAtual } = linha.stockInfo;
    if (tipoMov === "SAIDA") {
      if (!exists || quantidadeAtual <= 0) return (
        <span className="text-[10px] text-red-600 flex items-center gap-1">
          <AlertTriangle className="w-2.5 h-2.5" />
          Saldo insuficiente ({quantidadeAtual.toLocaleString("pt-BR", { maximumFractionDigits: 3 })})
        </span>
      );
      return (
        <span className="text-[10px] text-gray-500 flex items-center gap-1">
          <Info className="w-2.5 h-2.5" />
          Saldo: {quantidadeAtual.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
        </span>
      );
    }
    if (!exists) return (
      <span className="text-[10px] text-blue-600 flex items-center gap-1">
        <Info className="w-2.5 h-2.5" />
        Novo vínculo será criado
      </span>
    );
    return (
      <span className="text-[10px] text-gray-500 flex items-center gap-1">
        <Info className="w-2.5 h-2.5" />
        Saldo: {quantidadeAtual.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
      </span>
    );
  }

  // Column order
  const [colOrder, setColOrder] = useColumnOrder("movimentacoes", MOV_COLS.map((c) => c.id));
  const orderedMovCols = colOrder.map((id) => MOV_COLS.find((c) => c.id === id)).filter((c): c is ColDef<MovItem> => c !== undefined);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Auto-vínculo toast */}
      {autoVinculoMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-emerald-700 text-white text-sm px-5 py-3 rounded-2xl shadow-lg max-w-lg">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
          <span>{autoVinculoMsg}</span>
          <button onClick={() => setAutoVinculoMsg(null)} className="ml-1 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      <PageHeader
        title="Movimentações de Estoque"
        breadcrumbs={[{ label: "Almoxarifado" }, { label: "Movimentações" }]}
        action={
          <Button onClick={() => { resetModal(); setShowModal(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Movimentação
          </Button>
        }
      />

      <div className="px-8 pb-8 space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 max-w-sm">
          <div className="rounded-xl p-4 bg-gray-50 text-gray-700">
            <p className="text-xs font-medium opacity-75">Total</p>
            <p className="text-2xl font-bold mt-0.5">{lotes.length}</p>
          </div>
          <div className="rounded-xl p-4 bg-emerald-50 text-emerald-700">
            <p className="text-xs font-medium opacity-75">Entradas</p>
            <p className="text-2xl font-bold mt-0.5">{totalEntradas}</p>
          </div>
          <div className="rounded-xl p-4 bg-red-50 text-red-700">
            <p className="text-xs font-medium opacity-75">Saídas</p>
            <p className="text-2xl font-bold mt-0.5">{totalSaidas}</p>
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text" value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar por número, documento ou produto..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {search && (
              <button onClick={() => handleSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
            placeholder="Período..."
          />

          <FilterDropdown label="Tipo" options={TIPO_FILTER_OPTIONS} value={tipoFilter} onChange={setTipoFilter} allKey="todos" placeholder="Tipo..." />
          <FilterDropdown label="Local" options={LOCAL_FILTER_OPTIONS} value={localFilter} onChange={setLocalFilter} allKey="todos" placeholder="Local..." />
          <FilterDropdown label="Origem" options={ORIGEM_FILTER_OPTIONS} value={origemFilter} onChange={setOrigemFilter} allKey="todos" placeholder="Origem..." />
          {hasFilters && (
            <button onClick={() => { setSearch(""); setTipoFilter("todos"); setLocalFilter("todos"); setOrigemFilter("todos"); setDateRange(defaultRange); }} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3" /> Limpar
            </button>
          )}

          <ColumnConfigurator columns={MOV_COLS} order={colOrder} onOrderChange={setColOrder} />
        </div>

        {/* List */}
        {loadError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{loadError}</div>
        )}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : sortedFiltered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <p className="font-medium">{hasFilters ? "Nenhuma movimentação encontrada no período" : "Nenhuma movimentação registrada"}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedFiltered.map((lote) => {
              const isOpen  = expanded.has(lote.id);
              const isEntra = lote.tipo === "ENTRADA";
              const totalQtd = lote.itens.reduce((s, i) => s + toNum(i.quantidade), 0);
              return (
                <div key={lote.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Header row */}
                  <button
                    onClick={() => toggleExpand(lote.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    {isOpen
                      ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}

                    {/* Tipo badge */}
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0",
                      isEntra ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    )}>
                      {isEntra ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {isEntra ? "Entrada" : "Saída"}
                    </span>

                    {/* Origem badge */}
                    {loteOrigem(lote.itens) === "automatica" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 shrink-0">
                        <RefreshCw className="w-3 h-3" /> Auto
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 shrink-0">
                        Manual
                      </span>
                    )}

                    {/* Número */}
                    <span className="font-mono text-xs font-semibold text-gray-700 shrink-0">{lote.numero}</span>

                    {/* Documento */}
                    {lote.documento && (
                      <span className="text-xs text-gray-400 shrink-0">· {lote.documento}</span>
                    )}

                    {/* Item count pill */}
                    <span className="ml-1 bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full shrink-0">
                      {lote.itens.length} {lote.itens.length === 1 ? "item" : "itens"}
                    </span>

                    {/* Total qty */}
                    <span className="text-xs text-gray-400 shrink-0">
                      total: {totalQtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                    </span>

                    {/* Spacer */}
                    <span className="flex-1" />

                    {/* Observações (truncated) */}
                    {lote.observacoes && (
                      <span className="text-xs text-gray-400 truncate max-w-[200px]">{lote.observacoes}</span>
                    )}

                    {/* Date */}
                    <span className="text-xs text-gray-400 shrink-0 ml-2">{formatDateTime(lote.createdAt)}</span>
                  </button>

                  {/* Expanded items */}
                  {isOpen && (
                    <div className="border-t border-gray-100">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                            {orderedMovCols
                              .filter((col) => col.id !== "custoUnit" || isEntra)
                              .map((col) => (
                                <th key={col.id} className={col.thClass}>{col.label}</th>
                              ))}
                            <th className="w-16" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {lote.itens.map((it) => {
                            _movIsEntrada = isEntra;
                            return (
                              <tr key={it.id} className="group/row hover:bg-gray-50">
                                {orderedMovCols
                                  .filter((col) => col.id !== "custoUnit" || isEntra)
                                  .map((col) => (
                                    <td key={col.id} className={col.tdClass}>{col.render(it)}</td>
                                  ))}
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => openEditMov(it)}
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                      title="Editar"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => { setDeleteMov(it); setDeleteMovError(""); }}
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                      title="Excluir"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            <p className="text-xs text-gray-400 text-right pt-1">
              {sortedFiltered.length} movimentaç{sortedFiltered.length === 1 ? "ão" : "ões"} · mais recente primeiro
            </p>
          </div>
        )}
      </div>

      {/* ── Modal Editar Movimentação ─────────────────────────────────────────── */}
      {editMov && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900">Editar Movimentação</h2>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{editMov.item.codigo} — {editMov.item.descricao}</p>
              </div>
              <button onClick={() => setEditMov(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="space-y-1.5">
                <Label>Documento</Label>
                <Input
                  value={editMovForm.documento}
                  onChange={(e) => setEditMovForm((p) => ({ ...p, documento: e.target.value }))}
                  placeholder="NF, OS, etc."
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Input
                  value={editMovForm.observacoes}
                  onChange={(e) => setEditMovForm((p) => ({ ...p, observacoes: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                Quantidade e saldo não podem ser alterados para preservar a integridade do estoque.
              </p>
              {editMovError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editMovError}</p>
              )}
            </div>
            <div className="px-5 pb-5 flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setEditMov(null)} disabled={editMovSaving}>Cancelar</Button>
              <Button size="sm" onClick={submitEditMov} disabled={editMovSaving}>
                {editMovSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Excluir Movimentação ────────────────────────────────────────── */}
      {deleteMov && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Excluir movimentação?</p>
                <p className="text-sm text-gray-500 mt-0.5 font-mono">{deleteMov.item.codigo} — {deleteMov.item.descricao}</p>
              </div>
            </div>
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              O saldo de estoque será revertido automaticamente.
            </p>
            <p className="text-sm text-gray-600 mb-4">Esta ação é permanente e não pode ser desfeita.</p>
            {deleteMovError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{deleteMovError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteMov(null)} disabled={deleteMovLoading}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={confirmDeleteMov} disabled={deleteMovLoading}>
                {deleteMovLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Nova Movimentação ────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
              <h2 className="font-semibold text-gray-900">Nova Movimentação</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">

                {/* Tipo + Local */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Tipo selector */}
                  <div className="space-y-1.5">
                    <Label>Tipo</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["ENTRADA", "SAIDA"] as const).map((t) => (
                        <button
                          key={t} type="button"
                          onClick={() => { setTipoMov(t); setLinhas((p) => p.map((l) => ({ ...l, stockInfo: null }))); }}
                          className={cn(
                            "flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 text-sm font-medium transition-colors",
                            tipoMov === t
                              ? t === "ENTRADA"
                                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                : "border-red-500 bg-red-50 text-red-700"
                              : "border-gray-200 text-gray-500 hover:border-gray-300"
                          )}
                        >
                          {t === "ENTRADA" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          {t === "ENTRADA" ? "Entrada" : "Saída"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Local de Estoque — movimento inteiro */}
                  <div className="space-y-1.5">
                    <Label>Local de Estoque *</Label>
                    <ComboboxWithCreate
                      key={`local-${tipoMov}`}
                      options={locais.map((l) => ({ value: l.id, label: l.nome }))}
                      value={localEstoqueId}
                      onChange={handleLocalEstoqueChange}
                      allowNone={false}
                      placeholder="Selecionar local..."
                      createHref="/suprimentos/locais-estoque/novo"
                      createParam="nome"
                      createLabel="local de estoque"
                      renderCreateModal={(args) => <LocalEstoqueQuickCreate {...args} />}
                    />
                  </div>

                  {/* Fornecedor — só para ENTRADA */}
                  {tipoMov === "ENTRADA" && (
                    <div className="space-y-1.5">
                      <Label>Fornecedor <span className="text-xs text-gray-400 font-normal">(opcional — vincula automaticamente)</span></Label>
                      <ComboboxWithCreate
                        key="fornecedor-entrada"
                        options={fornecedores.map((f) => ({ value: f.id, label: f.nomeFantasia || f.razaoSocial }))}
                        value={fornecedorId}
                        onChange={setFornecedorId}
                        allowNone
                        noneLabel="Nenhum"
                        placeholder="Selecionar fornecedor..."
                        createHref="/suprimentos/fornecedores/novo"
                        createParam="nome"
                        createLabel="fornecedor"
                      />
                    </div>
                  )}
                </div>

                {/* Documento + Obs geral */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Documento</Label>
                    <Input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="NF, OS, etc." />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Observações</Label>
                    <Input value={obsGeral} onChange={(e) => setObsGeral(e.target.value)} placeholder="Opcional" />
                  </div>
                </div>

                {/* Items table */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Itens</Label>
                    <button
                      type="button" onClick={addLinha}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar item
                    </button>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    {/* Column headers */}
                    <div className={cn(
                      "grid gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide",
                      tipoMov === "ENTRADA"
                        ? "grid-cols-[1fr_70px_80px_90px_24px]"
                        : "grid-cols-[1fr_70px_90px_24px]"
                    )}>
                      <span>Produto</span>
                      <span>Unidade</span>
                      {tipoMov === "ENTRADA" && <span className="text-right">Custo Unit.</span>}
                      <span className="text-right">Quantidade</span>
                      <span />
                    </div>

                    {/* Linhas */}
                    <div className="divide-y divide-gray-50">
                      {linhas.map((linha) => (
                        <div key={linha.key} className="px-3 py-2.5 space-y-1">
                          <div className={cn(
                            "grid gap-2 items-center",
                            tipoMov === "ENTRADA"
                              ? "grid-cols-[1fr_70px_80px_90px_24px]"
                              : "grid-cols-[1fr_70px_90px_24px]"
                          )}>
                            {/* Produto */}
                            <ComboboxWithCreate
                              options={itemList.map((it) => ({ value: it.id, label: `${it.codigo} — ${it.descricao}` }))}
                              value={linha.itemId}
                              onChange={(v) => updateLinha(linha.key, { itemId: v, unidade: "" })}
                              allowNone={false}
                              placeholder="Selecionar produto..."
                              createHref="/suprimentos/produtos/novo"
                              createParam="descricao"
                              createLabel="produto"
                              triggerClassName="h-8 text-sm"
                            />

                            {/* Unidade */}
                            <UnitSelect
                              value={linha.unidade}
                              options={itemUnidades.get(linha.itemId) ?? []}
                              onChange={(v) => updateLinha(linha.key, { unidade: v })}
                              disabled={!linha.itemId}
                            />

                            {/* Custo Unitário (ENTRADA only) */}
                            {tipoMov === "ENTRADA" && (
                              <Input
                                type="number" step="0.01" min="0"
                                value={linha.valorUnitario}
                                onChange={(e) => updateLinha(linha.key, { valorUnitario: e.target.value })}
                                placeholder="R$ 0,00"
                                className="h-8 text-sm text-right"
                              />
                            )}

                            {/* Quantidade */}
                            <Input
                              type="number" step="0.001" min="0.001"
                              value={linha.quantidade}
                              onChange={(e) => updateLinha(linha.key, { quantidade: e.target.value })}
                              placeholder="0"
                              className="h-8 text-sm text-right"
                            />

                            {/* Remove */}
                            <button
                              type="button"
                              onClick={() => linhas.length > 1 ? removeLinha(linha.key) : undefined}
                              disabled={linhas.length === 1}
                              className="flex items-center justify-center text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Stock info below the row */}
                          {linhaAlert(linha) && (
                            <div className="pl-1">{linhaAlert(linha)}</div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Footer: item count */}
                    <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
                      {linhas.filter((l) => l.itemId && parseFloat(l.quantidade) > 0).length} de {linhas.length} {linhas.length === 1 ? "item" : "itens"} preenchido{linhas.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>

                {formError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
                )}
              </div>

              {/* Modal footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0 bg-white">
                <span className="text-xs text-gray-400">
                  {linhas.filter((l) => l.itemId && parseFloat(l.quantidade) > 0).length} itens válidos
                </span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)} disabled={submitting}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit" size="sm" disabled={submitting}
                    className={tipoMov === "SAIDA" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    Registrar {tipoMov === "ENTRADA" ? "Entrada" : "Saída"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
