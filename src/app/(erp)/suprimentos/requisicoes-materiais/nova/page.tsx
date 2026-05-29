"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Plus, Trash2, Loader2, Save, ChevronDown, X, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useTabTitle } from "@/lib/tabs-context";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type LocalEstoqueOpt = { id: string; nome: string };
type ColaboradorOpt  = { id: string; nome: string; setorId: string | null };
type SetorOpt        = { id: string; nome: string };
type CentroCustoOpt  = { id: string; codigo: string; nome: string };
type ItemOpt         = { id: string; codigo: string; descricao: string; unidadeMedida: string; unidade: { sigla: string } | null };

type ItemRow = {
  _key:         string;
  itemId:       string;
  quantidade:   string;
  unidade:      string;
  localizacao:  string;
  centroCustoId: string;
  contaContabil: string;
  os:           string;
  requisicaoRef: string;
};

function emptyRow(): ItemRow {
  return {
    _key:         Math.random().toString(36).slice(2),
    itemId:       "",
    quantidade:   "",
    unidade:      "",
    localizacao:  "",
    centroCustoId: "",
    contaContabil: "",
    os:           "",
    requisicaoRef: "",
  };
}

// ── Portal Select (Searchable) ────────────────────────────────────────────────

function PortalSelect<T extends { id: string }>({
  options, value, onChange, placeholder, getLabel, error,
}: {
  options: T[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  getLabel: (item: T) => string;
  error?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos]   = useState<{ top: number; left: number; width: number } | null>(null);
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

  function openDrop() { calcPos(); setQuery(""); setOpen(true); }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) { setOpen(false); setQuery(""); }
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

  return (
    <div ref={containerRef} className="relative">
      <div className={cn(
        "flex items-center rounded-lg border bg-white transition-colors",
        open ? "border-blue-400 ring-1 ring-blue-200"
          : error && !value ? "border-red-400 ring-1 ring-red-100"
          : "border-gray-200 hover:border-gray-300"
      )}>
        <input
          type="text"
          value={open ? query : (selected ? getLabel(selected) : "")}
          onChange={(e) => { setQuery(e.target.value); if (!open) openDrop(); }}
          onFocus={openDrop}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 text-sm bg-transparent outline-none placeholder:text-gray-400 text-gray-900"
        />
        {value && !open && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(""); setQuery(""); setOpen(false); }} className="px-1.5 text-gray-300 hover:text-gray-500">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className={cn("w-4 h-4 text-gray-400 shrink-0 mr-2 transition-transform", open && "rotate-180")} />
      </div>
      {mounted && open && createPortal(
        <div className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg overflow-auto max-h-56"
          style={{ top: pos?.top, left: pos?.left, width: pos?.width }}>
          {filtered.length > 0 ? filtered.map((o) => (
            <button key={o.id} type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(o.id); setOpen(false); setQuery(""); }}
              className={cn("w-full px-3 py-2 text-sm text-left hover:bg-blue-50 hover:text-blue-700 transition-colors",
                o.id === value && "bg-blue-50 text-blue-700 font-medium")}>
              {getLabel(o)}
            </button>
          )) : (
            <p className="px-3 py-2.5 text-sm text-gray-400 italic">
              {query ? `Nenhum resultado para "${query}"` : "Nenhuma opção"}
            </p>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Item search dropdown (portal) ─────────────────────────────────────────────

function ItemSearchCell({
  row, itensCat, onSelect,
}: {
  row: ItemRow;
  itensCat: ItemOpt[];
  onSelect: (key: string, itemId: string, sigla: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen]   = useState(false);
  const [pos,  setPos]    = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const selected = row.itemId ? itensCat.find((i) => i.id === row.itemId) : null;

  function calcPos() {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 360) });
  }

  const filtered = (query.trim()
    ? itensCat.filter((i) =>
        i.codigo.toLowerCase().includes(query.toLowerCase()) ||
        i.descricao.toLowerCase().includes(query.toLowerCase())
      )
    : itensCat
  ).slice(0, 50);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.closest(".item-search-wrap")?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    window.addEventListener("scroll", calcPos, true);
    return () => { document.removeEventListener("mousedown", handler); window.removeEventListener("scroll", calcPos, true); };
  }, [open]);

  return (
    <div className="item-search-wrap relative">
      <div className={cn(
        "flex items-center rounded-md border transition-colors bg-white",
        open ? "border-blue-400 ring-1 ring-blue-200" : "border-gray-200 hover:border-gray-300"
      )}>
        <input
          ref={inputRef}
          value={open ? query : (selected ? `${selected.codigo} — ${selected.descricao}` : "")}
          onChange={(e) => {
            setQuery(e.target.value);
            if (row.itemId && e.target.value !== `${selected?.codigo} — ${selected?.descricao}`) {
              onSelect(row._key, "", "");
            }
            calcPos();
            setOpen(true);
          }}
          onFocus={() => { setQuery(""); calcPos(); setOpen(true); }}
          placeholder="Buscar produto por código ou descrição..."
          className="flex-1 px-2 py-1.5 text-xs bg-transparent outline-none placeholder:text-gray-400 text-gray-900 h-8"
        />
        {row.itemId && !open && (
          <button
            type="button"
            onClick={() => { onSelect(row._key, "", ""); setQuery(""); }}
            className="px-1.5 text-gray-300 hover:text-gray-500"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {mounted && open && createPortal(
        <div className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
          style={{ top: pos?.top, left: pos?.left, width: pos?.width }}>
          {/* Header */}
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              Cadastro de Produtos
            </span>
            <span className="text-[10px] text-gray-400">{filtered.length} encontrado{filtered.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="overflow-auto max-h-48">
            {filtered.length > 0 ? filtered.map((it) => (
              <button key={it.id} type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(row._key, it.id, it.unidade?.sigla ?? it.unidadeMedida ?? "");
                  setQuery("");
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors flex items-center gap-3 border-b border-gray-50 last:border-0",
                  it.id === row.itemId && "bg-blue-50"
                )}>
                <span className="font-mono text-[11px] font-semibold text-blue-600 shrink-0 w-[72px] truncate">{it.codigo}</span>
                <span className="text-xs text-gray-800 font-medium truncate flex-1">{it.descricao}</span>
                {(it.unidade?.sigla || it.unidadeMedida) && (
                  <span className="text-[10px] text-gray-400 shrink-0 font-mono">{it.unidade?.sigla || it.unidadeMedida}</span>
                )}
              </button>
            )) : (
              <div className="px-3 py-4 text-center">
                <p className="text-xs text-gray-400 italic mb-2">
                  {query ? `Nenhum produto encontrado para "${query}"` : "Nenhum produto cadastrado"}
                </p>
                <a
                  href="/suprimentos/produtos/novo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <Plus className="w-3 h-3" /> Cadastrar novo produto
                </a>
              </div>
            )}
          </div>
          {/* Footer link */}
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
            <a
              href="/suprimentos/produtos"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-gray-400 hover:text-blue-600 transition-colors"
              onMouseDown={(e) => e.stopPropagation()}
            >
              Ver todos os produtos →
            </a>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Colaborador Quick-Create Modal ────────────────────────────────────────────

function ColaboradorQuickModal({
  initialValue,
  setores,
  onCreated,
  onClose,
}: {
  initialValue: string;
  setores: SetorOpt[];
  onCreated: (id: string, label: string) => void;
  onClose: () => void;
}) {
  const [nome,    setNome]    = useState(initialValue);
  const [cargo,   setCargo]   = useState("");
  const [setorId, setSetorId] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  async function handleSave() {
    if (!nome.trim()) { setError("Nome é obrigatório"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/empresa/colaboradores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome:    nome.trim(),
          cargo:   cargo.trim()   || null,
          setorId: setorId        || null,
          ativo:   true,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Erro ao criar colaborador");
        setSaving(false);
        return;
      }
      const colaborador = await res.json();
      onCreated(colaborador.id, colaborador.nome);
    } catch {
      setError("Erro inesperado");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-50 rounded-lg">
              <UserPlus className="w-4 h-4 text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">Novo Colaborador</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Nome <span className="text-red-500">*</span></Label>
            <Input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
              placeholder="Nome completo"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Cargo <span className="text-gray-400 font-normal">(opcional)</span></Label>
            <Input
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
              placeholder="Ex.: Técnico de Manutenção"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Setor <span className="text-gray-400 font-normal">(opcional)</span></Label>
            <select
              value={setorId}
              onChange={(e) => setSetorId(e.target.value)}
              className="w-full h-9 text-sm border border-gray-200 rounded-md px-3 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-700"
            >
              <option value="">— Selecionar setor —</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={saving || !nome.trim()}>
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Salvando...</>
              : <><Plus className="w-3.5 h-3.5 mr-1.5" />Criar Colaborador</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function NovaRequisicaoPage() {
  useTabTitle("Nova Req/Dev de Materiais");
  const router       = useRouter();
  const { confirmCreated, dialog: createdDialog } = useCreateFlow({
    entity: "requisição",
    gender: "f",
    onNew: () => { window.location.href = "/suprimentos/requisicoes-materiais/nova"; },
    viewHref: (id) => `/suprimentos/requisicoes-materiais/${id}`,
  });
  const searchParams = useSearchParams();

  const [tipo,           setTipo]           = useState<"REQUISICAO" | "DEVOLUCAO">("REQUISICAO");
  const [localEstoqueId, setLocalEstoqueId] = useState(searchParams.get("localEstoqueId") ?? "");
  const [colaboradorId,  setColaboradorId]  = useState("");
  const [setorId,        setSetorId]        = useState("");
  const [almoxarifeId,   setAlmoxarifeId]   = useState("");
  const [data,           setData]           = useState(() => new Date().toISOString().split("T")[0]);
  const [os,             setOs]             = useState("");
  const [centroCustoId,  setCentroCustoId]  = useState("");
  const [contaContabil,  setContaContabil]  = useState("");
  const [observacoes,    setObservacoes]    = useState("");
  const [rows,           setRows]           = useState<ItemRow[]>([emptyRow()]);

  const [locais,        setLocais]        = useState<LocalEstoqueOpt[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorOpt[]>([]);
  const [setores,       setSetores]       = useState<SetorOpt[]>([]);
  const [centros,       setCentros]       = useState<CentroCustoOpt[]>([]);
  const [itensCat,      setItensCat]      = useState<ItemOpt[]>([]);

  const [submitted, setSubmitted] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadOptions = useCallback(async () => {
    // fetch each independently so one failure doesn't block the others
    async function safeFetch(url: string) {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    }

    const [lData, cData, sData, ccData, itData] = await Promise.all([
      safeFetch("/api/suprimentos/locais-estoque?ativo=true"),
      safeFetch("/api/empresa/colaboradores?ativo=true"),
      safeFetch("/api/empresa/setores?ativo=true"),
      safeFetch("/api/empresa/centros-custo?ativo=true"),
      safeFetch("/api/suprimentos/produtos"),
    ]);

    if (lData  != null) setLocais(       Array.isArray(lData)  ? lData  : lData.data  ?? []);
    if (cData  != null) setColaboradores(Array.isArray(cData)  ? cData  : cData.data  ?? []);
    if (sData  != null) setSetores(      Array.isArray(sData)  ? sData  : sData.data  ?? []);
    if (ccData != null) setCentros(      Array.isArray(ccData) ? ccData : ccData.data ?? []);
    if (itData != null) setItensCat(     Array.isArray(itData) ? itData : itData.data ?? []);
  }, []);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  function handleColaboradorChange(id: string) {
    setColaboradorId(id);
    const col = colaboradores.find((c) => c.id === id);
    if (col?.setorId) setSetorId(col.setorId);
    else if (!id) setSetorId("");
  }

  function handleItemSelect(key: string, itemId: string, sigla: string) {
    setRows((prev) => prev.map((r) => r._key === key ? { ...r, itemId, unidade: sigla } : r));
  }

  function updateRow(key: string, field: keyof ItemRow, value: string) {
    setRows((prev) => prev.map((r) => r._key === key ? { ...r, [field]: value } : r));
  }

  async function handleSave(statusFinal: "RASCUNHO" | "ABERTA") {
    setSubmitted(true);
    if (!localEstoqueId) { setSaveError("Almoxarifado é obrigatório"); return; }
    const validRows = rows.filter((r) => r.itemId && r.quantidade);
    if (validRows.length === 0) { setSaveError("Adicione pelo menos um item"); return; }
    setSaving(true); setSaveError("");
    try {
      const res = await fetch("/api/suprimentos/requisicoes-materiais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo, localEstoqueId,
          colaboradorId:  colaboradorId  || null,
          setorId:        setorId        || null,
          almoxarifeId:   almoxarifeId   || null,
          os:             os             || null,
          centroCustoId:  centroCustoId  || null,
          contaContabil:  contaContabil  || null,
          data, observacoes: observacoes || null,
          itens: validRows.map((r) => ({
            itemId: r.itemId, quantidade: parseFloat(r.quantidade),
            unidade: r.unidade || null, localizacao: r.localizacao || null,
            centroCustoId: r.centroCustoId || null, contaContabil: r.contaContabil || null,
            os: r.os || null, requisicaoRef: r.requisicaoRef || null,
          })),
        }),
      });
      if (!res.ok) { setSaveError((await res.json()).error || "Erro ao salvar"); setSaving(false); return; }
      const { data: created } = await res.json();
      if (statusFinal === "ABERTA") {
        await fetch(`/api/suprimentos/requisicoes-materiais/${created.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ABERTA" }),
        });
      }
      confirmCreated(created.id);
    } catch (e) { setSaveError(String(e)); setSaving(false); }
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 px-8 pt-6 pb-2 text-sm text-gray-500">
        <Link href="/suprimentos/requisicoes-materiais" className="hover:text-gray-800 transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />Req/Dev de Materiais
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
        <span className="text-gray-800 font-medium">Nova</span>
      </div>

      <div className="px-8 pb-8 space-y-5 max-w-5xl">

        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{saveError}</div>
        )}

        {/* Type toggle */}
        <div className="flex items-center gap-2">
          {(["REQUISICAO", "DEVOLUCAO"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTipo(t)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
                tipo === t ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              )}>
              {t === "REQUISICAO" ? "Requisição de Materiais" : "Devolução de Materiais"}
            </button>
          ))}
        </div>

        {/* Header card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {tipo === "REQUISICAO" ? "Requisição de Materiais" : "Devolução de Materiais"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            <div className="grid grid-cols-3 gap-4">
              {/* Almoxarifado */}
              <div className="space-y-1.5">
                <Label>Almoxarifado <span className="text-red-500">*</span></Label>
                <PortalSelect
                  options={locais}
                  value={localEstoqueId}
                  onChange={setLocalEstoqueId}
                  placeholder="Selecionar almoxarifado..."
                  getLabel={(l) => l.nome}
                  error={submitted}
                />
                {submitted && !localEstoqueId && <p className="text-xs text-red-500">Almoxarifado é obrigatório</p>}
              </div>

              {/* Solicitante */}
              <div className="space-y-1.5">
                <Label>Solicitante</Label>
                <ComboboxWithCreate
                  options={colaboradores.map((c) => ({ value: c.id, label: c.nome }))}
                  value={colaboradorId}
                  onChange={handleColaboradorChange}
                  placeholder="Buscar colaborador..."
                  allowNone
                  createLabel="colaborador"
                  renderCreateModal={({ initialValue, onCreated, onClose }) => (
                    <ColaboradorQuickModal
                      initialValue={initialValue}
                      setores={setores}
                      onCreated={(id, label) => {
                        // Add to local list so Almoxarife dropdown also shows the new person
                        setColaboradores((prev) => [...prev, { id, nome: label, setorId: null }]);
                        onCreated(id, label);
                      }}
                      onClose={onClose}
                    />
                  )}
                />
              </div>

              {/* Setor */}
              <div className="space-y-1.5">
                <Label>Setor</Label>
                <PortalSelect
                  options={setores}
                  value={setorId}
                  onChange={setSetorId}
                  placeholder="Selecionar setor..."
                  getLabel={(s) => s.nome}
                />
              </div>

              {/* Almoxarife */}
              <div className="space-y-1.5">
                <Label>Almoxarife</Label>
                <PortalSelect
                  options={colaboradores}
                  value={almoxarifeId}
                  onChange={setAlmoxarifeId}
                  placeholder="Selecionar almoxarife..."
                  getLabel={(c) => c.nome}
                />
              </div>

              {/* Data */}
              <div className="space-y-1.5">
                <Label>Data <span className="text-red-500">*</span></Label>
                <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>

              {/* O.S. (Requisição only) */}
              {tipo === "REQUISICAO" && (
                <div className="space-y-1.5">
                  <Label>O.S.</Label>
                  <Input value={os} onChange={(e) => setOs(e.target.value)} placeholder="Ordem de serviço" />
                </div>
              )}
            </div>

            {/* Centro de Custo + Conta (Requisição only) */}
            {tipo === "REQUISICAO" && (
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Centro de Custo</Label>
                  <PortalSelect
                    options={centros}
                    value={centroCustoId}
                    onChange={setCentroCustoId}
                    placeholder="Selecionar centro de custo..."
                    getLabel={(c) => `${c.codigo} — ${c.nome}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Conta Contábil</Label>
                  <Input value={contaContabil} onChange={(e) => setContaContabil(e.target.value)} placeholder="Conta contábil" />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none placeholder:text-gray-400"
                placeholder="Informações adicionais..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Items table */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Produtos</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={() => setRows((p) => [...p, emptyRow()])}>
              <Plus className="w-4 h-4 mr-1" />Adicionar
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                    <th className="text-left px-3 py-2.5 min-w-[240px]">Produto</th>
                    <th className="text-left px-3 py-2.5 w-16">Un.</th>
                    <th className="text-left px-3 py-2.5 w-28">Qtde</th>
                    {tipo === "REQUISICAO" && <>
                      <th className="text-left px-3 py-2.5 min-w-[140px]">Centro de Custo</th>
                      <th className="text-left px-3 py-2.5 w-28">Conta Contábil</th>
                      <th className="text-left px-3 py-2.5 w-24">O.S.</th>
                      <th className="text-left px-3 py-2.5 w-24">Requisição</th>
                    </>}
                    <th className="text-left px-3 py-2.5 w-28">Localização</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => (
                    <tr key={row._key} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <ItemSearchCell row={row} itensCat={itensCat} onSelect={handleItemSelect} />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={row.unidade} onChange={(e) => updateRow(row._key, "unidade", e.target.value)} className="h-8 text-xs w-14" />
                      </td>
                      <td className="px-3 py-2">
                        <Input type="number" step="0.001" min="0" value={row.quantidade}
                          onChange={(e) => updateRow(row._key, "quantidade", e.target.value)} className="h-8 text-xs w-24" />
                      </td>
                      {tipo === "REQUISICAO" && <>
                        <td className="px-3 py-2">
                          <select value={row.centroCustoId} onChange={(e) => updateRow(row._key, "centroCustoId", e.target.value)}
                            className="h-8 text-xs border border-gray-200 rounded-md px-2 bg-white w-full focus:outline-none focus:ring-1 focus:ring-blue-400">
                            <option value="">—</option>
                            {centros.map((c) => <option key={c.id} value={c.id}>{c.codigo}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <Input value={row.contaContabil} onChange={(e) => updateRow(row._key, "contaContabil", e.target.value)} className="h-8 text-xs" />
                        </td>
                        <td className="px-3 py-2">
                          <Input value={row.os} onChange={(e) => updateRow(row._key, "os", e.target.value)} className="h-8 text-xs" />
                        </td>
                        <td className="px-3 py-2">
                          <Input value={row.requisicaoRef} onChange={(e) => updateRow(row._key, "requisicaoRef", e.target.value)} className="h-8 text-xs" />
                        </td>
                      </>}
                      <td className="px-3 py-2">
                        <Input value={row.localizacao} onChange={(e) => updateRow(row._key, "localizacao", e.target.value)} className="h-8 text-xs" placeholder="A1-01" />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => setRows((p) => p.filter((r) => r._key !== row._key))} className="text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button onClick={() => handleSave("ABERTA")} disabled={saving || !localEstoqueId}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            {tipo === "REQUISICAO" ? "Emitir Requisição" : "Emitir Devolução"}
          </Button>
          <Button variant="outline" onClick={() => handleSave("RASCUNHO")} disabled={saving}>
            Salvar Rascunho
          </Button>
          <Button variant="ghost" onClick={() => router.push("/suprimentos/requisicoes-materiais")} disabled={saving}>
            Cancelar
          </Button>
        </div>
      </div>
      {createdDialog}
    </div>
  );
}
