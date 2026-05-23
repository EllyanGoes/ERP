"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session-context";
import { useFormPersist } from "@/lib/form-persist";
import { useDirtyForm } from "@/lib/dirty-form-context";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, ChevronDown, Loader2, Save, CheckCircle2, X, AlertTriangle } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ConflictItem = {
  itemId: string;
  itemDescricao: string;
  itemCodigo: string;
  processos: Array<{ tipo: "SC" | "PC"; numero: string; status: string; id: string }>;
};

type Filial        = { id: string; razaoSocial: string; nomeFantasia: string | null };
type LocalEstoque  = { id: string; nome: string };
type CentroCusto   = { id: string; codigo: string; nome: string };
type ItemOption    = { id: string; codigo: string; descricao: string; unidade: { sigla: string } | null; estoqueItems?: Array<{ quantidadeAtual: number | string | null }> };
type UnidadeOption = { id: string; sigla: string; nome: string; isPrincipal: boolean };
type ColaboradorOpt = { id: string; nome: string; setorId: string | null; setor: { id: string; nome: string } | null };
type SetorOpt      = { id: string; nome: string; ativo: boolean };

type ItemRow = { itemId: string; quantidade: string; unidade: string; observacao: string };

const STATUS_PT: Record<string, string> = {
  RASCUNHO: "Rascunho",
  AGUARDANDO_APROVACAO: "Aguardando Aprovação",
  APROVADA: "Aprovada",
  ENVIADO: "Enviado",
  CONFIRMADO: "Confirmado",
  EM_TRANSITO: "Em Trânsito",
};

const PRIORIDADES = [
  { value: 1, label: "1 - Muito Baixa" },
  { value: 2, label: "2 - Baixa" },
  { value: 3, label: "3 - Média" },
  { value: 4, label: "4 - Alta" },
  { value: 5, label: "5 - Crítica" },
];

// ── SearchableSelect ──────────────────────────────────────────────────────────
// Campo de texto com filtro + dropdown via portal (para Filial e Local de Estoque)

function SearchableSelect<T extends { id: string }>({
  options, value, onChange, placeholder, getLabel, disabled, error,
}: {
  options: T[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  getLabel: (item: T) => string;
  disabled?: boolean;
  error?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");
  const [pos,   setPos]   = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const selected = options.find((o) => o.id === value);
  const filtered = query.trim()
    ? options.filter((o) => getLabel(o).toLowerCase().includes(query.toLowerCase()))
    : options;

  function calcPos() {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }

  function openDropdown() {
    calcPos();
    setQuery("");
    setOpen(true);
  }

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setQuery("");
    setOpen(false);
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    window.addEventListener("scroll", calcPos, true);
    window.addEventListener("resize", calcPos);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("scroll", calcPos, true);
      window.removeEventListener("resize", calcPos);
    };
  }, [open]);

  if (disabled) {
    return (
      <div className="flex items-center px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed min-h-[38px]">
        {placeholder}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className={cn(
        "flex items-center rounded-lg border bg-white transition-colors",
        open ? "border-blue-400 ring-1 ring-blue-200"
          : error && !value ? "border-red-400 ring-1 ring-red-100"
          : "border-gray-200 hover:border-gray-300"
      )}>
        <input
          ref={inputRef}
          type="text"
          value={open ? query : (selected ? getLabel(selected) : "")}
          onChange={(e) => { setQuery(e.target.value); if (!open) openDropdown(); }}
          onFocus={openDropdown}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 text-sm bg-transparent outline-none placeholder:text-gray-400 text-gray-900"
        />
        {value && !open && (
          <button type="button" onClick={handleClear} className="px-1.5 text-gray-300 hover:text-gray-500 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className={cn("w-4 h-4 text-gray-400 shrink-0 mr-2 transition-transform", open && "rotate-180")} />
      </div>

      {mounted && open && createPortal(
        <div
          className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg overflow-auto max-h-56"
          style={{ top: pos?.top, left: pos?.left, width: pos?.width }}
        >
          {filtered.length > 0 ? filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(o.id); }}
              className={cn(
                "w-full px-3 py-2 text-sm text-left hover:bg-blue-50 hover:text-blue-700 transition-colors",
                o.id === value && "bg-blue-50 text-blue-700 font-medium"
              )}
            >
              {getLabel(o)}
            </button>
          )) : (
            <p className="px-3 py-2.5 text-sm text-gray-400 italic">
              {query ? `Nenhum resultado para "${query}"` : "Nenhuma opção disponível"}
            </p>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── SelectField ───────────────────────────────────────────────────────────────
// Dropdown simples sem busca (usado para Centro de Custo)

function SelectField<T extends { id: string }>({
  options, value, onChange, placeholder, getLabel, disabled,
}: {
  options: T[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  getLabel: (item: T) => string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-left transition-colors",
          disabled ? "opacity-60 cursor-not-allowed bg-gray-50" : "hover:border-gray-300",
          open && "border-blue-400 ring-1 ring-blue-200"
        )}
      >
        <span className={selected ? "text-gray-900" : "text-gray-400"}>
          {selected ? getLabel(selected) : placeholder}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-auto max-h-52">
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="w-full px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 text-left">(Nenhum)</button>
            {options.map((o) => (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false); }}
                className={cn("w-full px-3 py-2 text-sm text-left hover:bg-blue-50 hover:text-blue-700 transition-colors", o.id === value && "bg-blue-50 text-blue-700 font-medium")}>
                {getLabel(o)}
              </button>
            ))}
            {options.length === 0 && <p className="px-3 py-2 text-sm text-gray-400 italic">Nenhuma opção disponível</p>}
          </div>
        </>
      )}
    </div>
  );
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

  // No units registered → show plain text
  if (disabled || options.length === 0) {
    return (
      <div className="h-9 flex items-center px-3 text-sm border border-gray-100 rounded-md bg-gray-50 font-mono text-gray-500">
        {value || "—"}
      </div>
    );
  }

  // Only one unit → show as non-interactive badge
  if (options.length === 1) {
    return (
      <div className="h-9 flex items-center px-3 text-sm border border-gray-100 rounded-md bg-gray-50 font-mono text-gray-700">
        {value || options[0].sigla}
      </div>
    );
  }

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen((p) => !p)}
        className={cn(
          "h-9 w-full flex items-center justify-between px-2 text-sm border border-gray-200 rounded-md bg-white font-mono transition-colors hover:border-gray-300",
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

// ── Page ──────────────────────────────────────────────────────────────────────

type FormSnapshot = {
  filialId: string;
  descricao: string;
  prioridade: number;
  entregaDesejada: string;
  colaboradorId: string;
  setorId: string;
  tipoCompra: string;
  motivo: string;
  localEstoqueId: string;
  centroCustoId: string;
  observacoes: string;
  itens: ItemRow[];
};

export default function NovasolicitacaoPage() {
  const router   = useRouter();
  const { user } = useSession();

  const { save: saveForm, load: loadForm, clear: clearForm } = useFormPersist<FormSnapshot>("sc:nova");
  const formRestoredRef = useRef(false);

  const [filialId,              setFilialId]              = useState("");
  const [descricao,             setDescricao]             = useState("");
  const [prioridade,            setPrioridade]            = useState(3);
  const [entregaDesejada,       setEntregaDesejada]       = useState("");
  const [colaboradorId,         setColaboradorId]         = useState("");
  const [setorId,               setSetorId]               = useState("");
  const [tipoCompra,            setTipoCompra]            = useState("");
  const [motivo,                setMotivo]                = useState("");
  const [localEstoqueId,        setLocalEstoqueId]        = useState("");
  const [centroCustoId,         setCentroCustoId]         = useState("");
  const [observacoes,           setObservacoes]           = useState("");

  const [itens,       setItens]       = useState<ItemRow[]>([{ itemId: "", quantidade: "1", unidade: "", observacao: "" }]);

  const isDirty = !!(filialId || descricao || motivo || localEstoqueId || itens.some(r => r.itemId));
  useDirtyForm(isDirty);

  const [saving,      setSaving]      = useState(false);
  const [serverError, setServerError] = useState("");
  const [submitted,   setSubmitted]   = useState(false);
  const [successDialog, setSuccessDialog] = useState<{ numero: string; id: string } | null>(null);

  const [showDuplicateWarning,  setShowDuplicateWarning]  = useState(false);
  const [duplicateConflicts,    setDuplicateConflicts]    = useState<ConflictItem[]>([]);
  const [userConfirmedDuplicate, setUserConfirmedDuplicate] = useState(false);

  const [filiais,        setFiliais]        = useState<Filial[]>([]);
  const [locaisEstoque,  setLocaisEstoque]  = useState<LocalEstoque[]>([]);
  const [centrosCusto,   setCentrosCusto]   = useState<CentroCusto[]>([]);
  const [itemOptions,    setItemOptions]    = useState<ItemOption[]>([]);
  const [colaboradores,  setColaboradores]  = useState<ColaboradorOpt[]>([]);
  const [setores,        setSetores]        = useState<SetorOpt[]>([]);
  // Map itemId → list of units pre-registered for that product
  const [itemUnidades,   setItemUnidades]   = useState<Map<string, UnidadeOption[]>>(new Map());

  // Restore on mount from sessionStorage (takes priority over user.nome fallback)
  useEffect(() => {
    const saved = loadForm();
    if (saved && !formRestoredRef.current) {
      formRestoredRef.current = true;
      setFilialId(saved.filialId ?? "");
      setDescricao(saved.descricao ?? "");
      setPrioridade(saved.prioridade ?? 3);
      setEntregaDesejada(saved.entregaDesejada ?? "");
      setColaboradorId(saved.colaboradorId ?? "");
      setSetorId(saved.setorId ?? "");
      setTipoCompra(saved.tipoCompra ?? "");
      setMotivo(saved.motivo ?? "");
      setLocalEstoqueId(saved.localEstoqueId ?? "");
      setCentroCustoId(saved.centroCustoId ?? "");
      setObservacoes(saved.observacoes ?? "");
      setItens(saved.itens ?? [{ itemId: "", quantidade: "1", unidade: "", observacao: "" }]);
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    fetch("/api/empresa/filiais?ativo=true").then((r) => r.json()).then((j) => setFiliais(Array.isArray(j) ? j : []));
    fetch("/api/empresa/centros-custo?ativo=true").then((r) => r.json()).then((j) => setCentrosCusto(Array.isArray(j) ? j : []));
    fetch("/api/suprimentos/produtos").then((r) => r.json()).then((j) => setItemOptions(Array.isArray(j) ? j : j.data ?? []));
    fetch("/api/empresa/colaboradores?ativo=true").then((r) => r.json()).then((j) => setColaboradores(Array.isArray(j) ? j : []));
    fetch("/api/empresa/setores?ativo=true").then((r) => r.json()).then((j) => setSetores(Array.isArray(j) ? j : []));
  }, []);

  // Auto-save form state to sessionStorage on every change
  useEffect(() => {
    saveForm({ filialId, descricao, prioridade, entregaDesejada, colaboradorId, setorId, tipoCompra, motivo, localEstoqueId, centroCustoId, observacoes, itens });
  }, [filialId, descricao, prioridade, entregaDesejada, colaboradorId, setorId, tipoCompra, motivo, localEstoqueId, centroCustoId, observacoes, itens, saveForm]);

  const loadLocais = useCallback(async (fId: string) => {
    if (!fId) { setLocaisEstoque([]); setLocalEstoqueId(""); return; }
    const res  = await fetch(`/api/suprimentos/locais-estoque?ativo=true&filialId=${fId}`);
    const json = await res.json();
    const list = Array.isArray(json) ? json : [];
    setLocaisEstoque(list);
    if (localEstoqueId && !list.find((l: LocalEstoque) => l.id === localEstoqueId)) setLocalEstoqueId("");
  }, [localEstoqueId]);

  useEffect(() => { loadLocais(filialId); }, [filialId]); // eslint-disable-line

  // Fetch units for a product (cached)
  async function fetchItemUnidades(itemId: string) {
    if (!itemId || itemUnidades.has(itemId)) return;
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

  function resetForm() {
    setDescricao(""); setPrioridade(3); setEntregaDesejada(""); setTipoCompra("");
    setMotivo(""); setLocalEstoqueId(""); setCentroCustoId(""); setObservacoes("");
    setColaboradorId(""); setSetorId("");
    setItens([{ itemId: "", quantidade: "1", unidade: "", observacao: "" }]);
    setServerError("");
  }

  function addRow() { setItens((p) => [...p, { itemId: "", quantidade: "1", unidade: "", observacao: "" }]); }
  function removeRow(i: number) { setItens((p) => p.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, key: keyof ItemRow, value: string) {
    setItens((p) => p.map((row, idx) => idx === i ? { ...row, [key]: value } : row));
  }

  async function handleItemChange(i: number, itemId: string) {
    updateRow(i, "itemId", itemId);
    if (!itemId) { updateRow(i, "unidade", ""); return; }
    let units = itemUnidades.get(itemId);
    if (!units) units = await fetchItemUnidades(itemId) ?? [];
    // Auto-select principal unit
    const principal = units.find((u) => u.isPrincipal) ?? units[0];
    if (principal) updateRow(i, "unidade", principal.sigla);
    else {
      // fallback to item's own unit
      const item = itemOptions.find((o) => o.id === itemId);
      updateRow(i, "unidade", item?.unidade?.sigla ?? "");
    }
  }

  async function doSubmit(validItens: ItemRow[]) {
    setSaving(true); setServerError("");
    try {
      const res = await fetch("/api/suprimentos/necessidades", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filialId, justificativa: descricao.trim(), prioridade,
          dataNecessidade: entregaDesejada || null,
          colaboradorId: colaboradorId || null,
          setorId: setorId || null,
          solicitante: colaboradores.find((c) => c.id === colaboradorId)?.nome?.trim() || null,
          tipoCompra: tipoCompra.trim() || null,
          motivo: motivo.trim() || null, localEstoqueId: localEstoqueId || null,
          centroCustoId: centroCustoId || null,
          observacoes: observacoes.trim() || null,
          itens: validItens.map((r) => ({
            itemId: r.itemId, quantidade: parseFloat(r.quantidade),
            unidade: r.unidade || null, observacao: r.observacao || null,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setServerError(json.error || "Erro ao criar solicitação"); return; }
      clearForm();
      setSuccessDialog({ numero: json.data.numero, id: json.data.id });
    } catch { setServerError("Erro de conexão. Tente novamente."); }
    finally { setSaving(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!filialId) { setServerError("Filial é obrigatória"); return; }
    if (!localEstoqueId) { setServerError("Local de Estoque é obrigatório"); return; }
    if (!colaboradorId) { setServerError("Solicitante é obrigatório"); return; }
    if (!setorId) { setServerError("Setor é obrigatório"); return; }
    if (!motivo.trim()) { setServerError("Motivo de compra é obrigatório"); return; }
    const validItens = itens.filter((r) => r.itemId && parseFloat(r.quantidade) > 0);
    if (validItens.length === 0) { setServerError("Adicione pelo menos um item com quantidade válida"); return; }
    if (!descricao.trim()) { setServerError("Descrição é obrigatória"); return; }

    // Duplicate check (skip if user already confirmed)
    if (!userConfirmedDuplicate) {
      try {
        const checkRes = await fetch("/api/suprimentos/necessidades/check-duplicados", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds: validItens.map((r) => r.itemId) }),
        });
        if (checkRes.ok) {
          const checkJson = await checkRes.json();
          if (checkJson.conflicts && checkJson.conflicts.length > 0) {
            setDuplicateConflicts(checkJson.conflicts);
            setShowDuplicateWarning(true);
            return;
          }
        }
      } catch {
        // If duplicate check fails, proceed with submission anyway
      }
    }

    await doSubmit(validItens);
  }

  return (
    <div>
      <PageHeader
        title="Nova Solicitação de Compras"
        breadcrumbs={[{ label: "Compras" }, { label: "Solicitações de Compras", href: "/compras/necessidades" }, { label: "Nova" }]}
      />

      <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5 max-w-5xl">
        {serverError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{serverError}</div>}

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Informações</CardTitle></CardHeader>
          <CardContent className="space-y-4">

            <div className="space-y-1.5">
              <Label>Filial <span className="text-red-500">*</span></Label>
              <SearchableSelect options={filiais} value={filialId}
                onChange={(v) => { setFilialId(v); setLocalEstoqueId(""); }}
                placeholder="Digite para filtrar filial..." getLabel={(f) => f.nomeFantasia || f.razaoSocial}
                error={submitted && !filialId} />
              {submitted && !filialId
                ? <p className="text-xs text-red-500">Filial é obrigatória</p>
                : !filialId && <p className="text-xs text-gray-400">Selecione a filial para habilitar o campo Local de Estoque</p>
              }
            </div>

            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-6 space-y-1.5">
                <Label>Descrição <span className="text-red-500">*</span></Label>
                <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descreva o que está sendo solicitado..." />
              </div>
              <div className="col-span-3 space-y-1.5">
                <Label>Prioridade <span className="text-red-500">*</span></Label>
                <select value={prioridade} onChange={(e) => setPrioridade(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                  {PRIORIDADES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="col-span-3 space-y-1.5">
                <Label>Entrega desejada</Label>
                <Input type="date" value={entregaDesejada} onChange={(e) => setEntregaDesejada(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label>Solicitante <span className="text-red-500">*</span></Label>
                <SearchableSelect
                  options={colaboradores}
                  value={colaboradorId}
                  onChange={(v) => {
                    setColaboradorId(v);
                    const col = colaboradores.find((c) => c.id === v);
                    if (col?.setorId) setSetorId(col.setorId);
                    else if (!v) setSetorId("");
                  }}
                  placeholder="Buscar colaborador..."
                  getLabel={(c) => c.nome}
                  error={submitted && !colaboradorId}
                />
                {submitted && !colaboradorId && <p className="text-xs text-red-500">Solicitante é obrigatório</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Setor <span className="text-red-500">*</span></Label>
                <SelectField
                  options={setores.filter((s) => s.ativo)}
                  value={setorId}
                  onChange={setSetorId}
                  placeholder="Selecionar setor..."
                  getLabel={(s) => s.nome}
                />
                {submitted && !setorId && <p className="text-xs text-red-500">Setor é obrigatório</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de compra</Label>
                <select value={tipoCompra} onChange={(e) => setTipoCompra(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                  <option value="">Selecione...</option>
                  <option value="SGA">SGA</option><option value="OPEX">OPEX</option>
                  <option value="CAPEX">CAPEX</option><option value="ESTOQUE">ESTOQUE</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Motivo <span className="text-red-500">*</span></Label>
                <Input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Motivo da solicitação..."
                  className={submitted && !motivo.trim() ? "border-red-400 focus-visible:ring-red-200" : ""}
                />
                {submitted && !motivo.trim() && <p className="text-xs text-red-500">Motivo é obrigatório</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Local de Estoque <span className="text-red-500">*</span></Label>
                <SearchableSelect options={locaisEstoque} value={localEstoqueId} onChange={setLocalEstoqueId}
                  placeholder={filialId ? (locaisEstoque.length === 0 ? "Nenhum local para esta filial" : "Digite para filtrar local...") : "Selecione a filial primeiro"}
                  getLabel={(l) => l.nome} disabled={!filialId}
                  error={submitted && !!filialId && !localEstoqueId} />
                {submitted && !!filialId && !localEstoqueId && (
                  <p className="text-xs text-red-500">Local de Estoque é obrigatório</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Centro de Custo</Label>
                <SelectField options={centrosCusto} value={centroCustoId} onChange={setCentroCustoId}
                  placeholder="Selecionar centro de custo..." getLabel={(c) => `${c.codigo} - ${c.nome}`} />
              </div>
            </div>


            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Informações adicionais sobre a solicitação..." rows={3} />
            </div>
          </CardContent>
        </Card>

        {/* ── Itens ── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Itens Solicitados</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={addRow}><Plus className="w-4 h-4 mr-1" />Adicionar Item</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {itens.map((row, i) => {
              const units = itemUnidades.get(row.itemId) ?? [];
              return (
                <div key={i} className="grid grid-cols-12 gap-3 items-end">
                  <div className="col-span-5 space-y-1.5">
                    {i === 0 && <Label>Produto</Label>}
                    <ComboboxWithCreate
                      options={itemOptions.map((opt) => {
                        const saldo = (opt.estoqueItems ?? []).reduce(
                          (sum, ei) => sum + parseFloat(String(ei.quantidadeAtual ?? 0)), 0
                        );
                        return { value: opt.id, label: `[${opt.codigo}] ${opt.descricao}`, code: opt.codigo, saldo };
                      })}
                      value={row.itemId}
                      onChange={(v) => handleItemChange(i, v)}
                      allowNone={false}
                      placeholder="Selecionar produto..."
                      createHref="/suprimentos/produtos/novo"
                      createParam="descricao"
                      createLabel="produto"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    {i === 0 && <Label>Quantidade</Label>}
                    <Input type="number" step="0.001" min="0.001" value={row.quantidade} onChange={(e) => updateRow(i, "quantidade", e.target.value)} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    {i === 0 && <Label>Unidade</Label>}
                    <UnitSelect
                      value={row.unidade}
                      options={units}
                      onChange={(v) => updateRow(i, "unidade", v)}
                      disabled={!row.itemId}
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    {i === 0 && <Label>Observação</Label>}
                    <Input value={row.observacao} onChange={(e) => updateRow(i, "observacao", e.target.value)} placeholder="Opcional..." />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {itens.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" className="text-red-500" onClick={() => removeRow(i)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Salvando...</> : <><Save className="w-4 h-4 mr-1" />Criar Solicitação</>}
          </Button>
        </div>
      </form>

      {/* ── Duplicate Warning Modal ──────────────────────────────────────────── */}
      {showDuplicateWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-amber-100 bg-amber-50">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Itens já em andamento</p>
                <p className="text-xs text-gray-500 mt-0.5">Alguns itens já estão presentes em processos ativos</p>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-4 max-h-72 overflow-y-auto space-y-3">
              <p className="text-sm text-gray-600">Os seguintes itens já estão em processos ativos:</p>
              <ul className="space-y-3">
                {duplicateConflicts.map((c) => (
                  <li key={c.itemId} className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2.5">
                    <p className="text-sm font-medium text-gray-800">
                      <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded mr-1.5">{c.itemCodigo}</span>
                      {c.itemDescricao}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {c.processos.map((p, idx) => (
                        <li key={idx} className="flex items-center gap-1.5 text-xs text-gray-600">
                          <span className="text-gray-400">→</span>
                          <span className="font-mono font-semibold text-gray-700">{p.numero}</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-medium",
                            p.tipo === "SC"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-purple-100 text-purple-700"
                          )}>{p.tipo}</span>
                          <span className="text-gray-500">{STATUS_PT[p.status] ?? p.status}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-gray-600 pt-1">Deseja prosseguir assim mesmo?</p>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDuplicateWarning(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="bg-amber-500 hover:bg-amber-600 text-white border-0"
                onClick={async () => {
                  setUserConfirmedDuplicate(true);
                  setShowDuplicateWarning(false);
                  const validItens = itens.filter((r) => r.itemId && parseFloat(r.quantidade) > 0);
                  await doSubmit(validItens);
                }}
              >
                Prosseguir assim mesmo
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success Dialog ───────────────────────────────────────────────────── */}
      {successDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">Solicitação criada!</p>
              <p className="text-sm text-gray-500 mt-0.5">
                <span className="font-mono font-bold text-gray-700">{successDialog.numero}</span> foi registrada com sucesso.
              </p>
            </div>
            <p className="text-sm text-gray-600">Deseja criar outra solicitação?</p>
            <div className="flex gap-3 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { router.push(`/compras/necessidades/${successDialog.id}`); setSuccessDialog(null); }}
              >
                Ver solicitação
              </Button>
              <Button
                className="flex-1"
                onClick={() => { setSuccessDialog(null); resetForm(); }}
              >
                Criar outra
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
