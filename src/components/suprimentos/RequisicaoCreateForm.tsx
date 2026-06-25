"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2, Loader2, Save, ChevronDown, X, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { useVoltarCriacao } from "@/components/shared/CreateDrawer";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type LocalEstoqueOpt = { id: string; nome: string };
type ColaboradorOpt  = { id: string; nome: string; setorId: string | null };
type SetorOpt        = { id: string; nome: string };
type CentroCustoOpt  = { id: string; codigo: string; nome: string };
type ItemOpt         = { id: string; codigo: string; descricao: string; unidadeMedida: string; unidade: { sigla: string } | null; fabril?: boolean; capitaliza?: boolean; categoriaEstoque?: string | null; compoeCusto?: boolean };

type ItemRow = {
  _key:         string;
  itemId:       string;
  quantidade:   string;
  unidade:      string;
  localizacao:  string;
  centroCustoId: string;
  naturezaFinanceiraId: string;
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
    naturezaFinanceiraId: "",
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
        "flex items-center rounded-lg border bg-card transition-colors",
        open ? "border-blue-400 ring-1 ring-blue-200"
          : error && !value ? "border-red-400 ring-1 ring-red-100"
          : "border-border hover:border-border"
      )}>
        <input
          type="text"
          value={open ? query : (selected ? getLabel(selected) : "")}
          onChange={(e) => { setQuery(e.target.value); if (!open) openDrop(); }}
          onFocus={openDrop}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 text-sm bg-transparent outline-none placeholder:text-muted-foreground text-foreground"
        />
        {value && !open && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(""); setQuery(""); setOpen(false); }} className="px-1.5 text-muted-foreground/60 hover:text-muted-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 mr-2 transition-transform", open && "rotate-180")} />
      </div>
      {mounted && open && createPortal(
        <div className="fixed z-[9999] bg-card border border-border rounded-xl shadow-lg overflow-auto max-h-56"
          style={{ top: pos?.top, left: pos?.left, width: pos?.width }}>
          {filtered.length > 0 ? filtered.map((o) => (
            <button key={o.id} type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(o.id); setOpen(false); setQuery(""); }}
              className={cn("w-full px-3 py-2 text-sm text-left hover:bg-info/10 hover:text-info transition-colors",
                o.id === value && "bg-info/10 text-info font-medium")}>
              {getLabel(o)}
            </button>
          )) : (
            <p className="px-3 py-2.5 text-sm text-muted-foreground italic">
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
        "flex items-center rounded-md border transition-colors bg-card",
        open ? "border-blue-400 ring-1 ring-blue-200" : "border-border hover:border-border"
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
          className="flex-1 px-2 py-1.5 text-xs bg-transparent outline-none placeholder:text-muted-foreground text-foreground h-8"
        />
        {row.itemId && !open && (
          <button
            type="button"
            onClick={() => { onSelect(row._key, "", ""); setQuery(""); }}
            className="px-1.5 text-muted-foreground/60 hover:text-muted-foreground"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {mounted && open && createPortal(
        <div className="fixed z-[9999] bg-card border border-border rounded-xl shadow-lg overflow-hidden"
          style={{ top: pos?.top, left: pos?.left, width: pos?.width }}>
          {/* Header */}
          <div className="px-3 py-2 bg-muted border-b border-border flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Cadastro de Produtos
            </span>
            <span className="text-[10px] text-muted-foreground">{filtered.length} encontrado{filtered.length !== 1 ? "s" : ""}</span>
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
                  "w-full text-left px-3 py-2.5 hover:bg-info/10 transition-colors flex items-center gap-3 border-b border-gray-50 last:border-0",
                  it.id === row.itemId && "bg-info/10"
                )}>
                <span className="font-mono text-[11px] font-semibold text-info shrink-0 w-[72px] truncate">{it.codigo}</span>
                <span className="text-xs text-foreground font-medium truncate flex-1">{it.descricao}</span>
                {(it.unidade?.sigla || it.unidadeMedida) && (
                  <span className="text-[10px] text-muted-foreground shrink-0 font-mono">{it.unidade?.sigla || it.unidadeMedida}</span>
                )}
              </button>
            )) : (
              <div className="px-3 py-4 text-center">
                <p className="text-xs text-muted-foreground italic mb-2">
                  {query ? `Nenhum produto encontrado para "${query}"` : "Nenhum produto cadastrado"}
                </p>
                <a
                  href="/suprimentos/produtos/novo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-info hover:text-info font-medium"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <Plus className="w-3 h-3" /> Cadastrar novo produto
                </a>
              </div>
            )}
          </div>
          {/* Footer link */}
          <div className="px-3 py-2 bg-muted border-t border-border">
            <a
              href="/suprimentos/produtos"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground hover:text-info transition-colors"
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
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-info/10 rounded-lg">
              <UserPlus className="w-4 h-4 text-info" />
            </div>
            <h3 className="font-semibold text-foreground text-sm">Novo Colaborador</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {error && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
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
            <Label className="text-xs">Cargo <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
              placeholder="Ex.: Técnico de Manutenção"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Setor <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <ComboboxWithCreate
              value={setorId}
              onChange={setSetorId}
              placeholder="— Selecionar setor —"
              noneLabel="Selecionar setor"
              triggerClassName="h-9 rounded-md"
              options={setores.map((s) => ({ value: s.id, label: s.nome }))}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
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

export default function RequisicaoCreateForm() {
  const voltar       = useVoltarCriacao("/suprimentos/requisicoes-materiais");
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
  // Data de hoje no fuso do USUÁRIO (toISOString seria UTC: depois das ~21h
  // no Brasil já viraria o dia seguinte e o formulário nasceria com data errada)
  const [data,           setData]           = useState(() => new Date().toLocaleDateString("sv-SE"));
  const [os,             setOs]             = useState("");
  const [centroCustoId,  setCentroCustoId]  = useState("");
  const [naturezaFinanceiraId, setNaturezaFinanceiraId] = useState("");
  const [observacoes,    setObservacoes]    = useState("");
  const [rows,           setRows]           = useState<ItemRow[]>([emptyRow()]);

  const [locais,        setLocais]        = useState<LocalEstoqueOpt[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorOpt[]>([]);
  const [setores,       setSetores]       = useState<SetorOpt[]>([]);
  const [centros,       setCentros]       = useState<CentroCustoOpt[]>([]);
  const [naturezas,     setNaturezas]     = useState<{ id: string; nome: string; cif?: boolean }[]>([]);
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

    const [lData, cData, sData, ccData, itData, nData] = await Promise.all([
      safeFetch("/api/suprimentos/locais-estoque?ativo=true"),
      safeFetch("/api/empresa/colaboradores?ativo=true"),
      safeFetch("/api/empresa/setores?ativo=true"),
      safeFetch("/api/empresa/centros-custo?ativo=true"),
      safeFetch("/api/suprimentos/produtos"),
      safeFetch("/api/financeiro/naturezas?tipo=SAIDA&ativo=1"),
    ]);

    if (lData  != null) setLocais(       Array.isArray(lData)  ? lData  : lData.data  ?? []);
    if (cData  != null) setColaboradores(Array.isArray(cData)  ? cData  : cData.data  ?? []);
    if (sData  != null) setSetores(      Array.isArray(sData)  ? sData  : sData.data  ?? []);
    if (ccData != null) setCentros(      Array.isArray(ccData) ? ccData : ccData.data ?? []);
    if (itData != null) setItensCat(     Array.isArray(itData) ? itData : itData.data ?? []);
    if (nData  != null) setNaturezas(    Array.isArray(nData)  ? nData  : nData.data  ?? []);
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
    // Natureza é obrigatória POR ITEM (o cabeçalho "aplica a todos" preenche as linhas).
    if (tipo === "REQUISICAO") {
      const semNat = validRows.filter((r) => !(r.naturezaFinanceiraId || naturezaFinanceiraId));
      if (semNat.length > 0) {
        const cods = semNat.map((r) => itensCat.find((i) => i.id === r.itemId)?.codigo ?? r.itemId).join(", ");
        setSaveError(`Natureza financeira é obrigatória em cada item: ${cods}. Informe no cabeçalho (aplica a todos) ou na linha.`);
        return;
      }
    }
    // Item indireto de fábrica (fabril) precisa de centro de custo (na linha ou no
    // cabeçalho) para classificar CIF × Despesa — senão a contabilidade não decide.
    if (tipo === "REQUISICAO") {
      const semCentro = validRows.filter((r) => {
        const it = itensCat.find((i) => i.id === r.itemId);
        // capitaliza vai para Imobilizado independente do centro — não exige centro.
        return it?.fabril === true && it?.capitaliza !== true && !(r.centroCustoId || centroCustoId);
      });
      if (semCentro.length > 0) {
        const cods = semCentro.map((r) => itensCat.find((i) => i.id === r.itemId)?.codigo ?? r.itemId).join(", ");
        setSaveError(`Itens indiretos de fábrica exigem centro de custo (para classificar CIF × Despesa): ${cods}. Informe no cabeçalho ou na linha do item.`);
        return;
      }
    }
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
          naturezaFinanceiraId: naturezaFinanceiraId || null,
          data, observacoes: observacoes || null,
          itens: validRows.map((r) => ({
            itemId: r.itemId, quantidade: parseFloat(r.quantidade),
            unidade: r.unidade || null, localizacao: r.localizacao || null,
            centroCustoId: r.centroCustoId || null,
            naturezaFinanceiraId: r.naturezaFinanceiraId || null,
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
      <div className="space-y-5 max-w-5xl">

        {saveError && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">{saveError}</div>
        )}

        {/* Type toggle */}
        <div className="flex items-center gap-2">
          {(["REQUISICAO", "DEVOLUCAO"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTipo(t)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
                tipo === t ? "bg-blue-600 text-white border-blue-600" : "bg-card text-muted-foreground border-border hover:border-border"
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

            {/* Centro de Custo + Natureza — atalho que APLICA A TODOS os itens (o
                valor gravado é por item; pode ajustar linha a linha na tabela). */}
            {tipo === "REQUISICAO" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Centro de Custo <span className="text-muted-foreground font-normal text-xs">(aplica a todos os itens)</span></Label>
                  <PortalSelect
                    options={centros}
                    value={centroCustoId}
                    onChange={(v) => { setCentroCustoId(v); setRows((prev) => prev.map((r) => ({ ...r, centroCustoId: v }))); }}
                    placeholder="Selecionar centro de custo..."
                    getLabel={(c) => `${c.codigo} — ${c.nome}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Natureza financeira <span className="text-muted-foreground font-normal text-xs">(aplica a todos os itens)</span></Label>
                  <PortalSelect
                    options={naturezas}
                    value={naturezaFinanceiraId}
                    onChange={(v) => { setNaturezaFinanceiraId(v); setRows((prev) => prev.map((r) => ({ ...r, naturezaFinanceiraId: v }))); }}
                    placeholder="Selecionar natureza..."
                    getLabel={(n) => `${n.nome}${n.cif ? " · CIF" : ""}`}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none placeholder:text-muted-foreground"
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
                <thead className="bg-muted border-b border-border">
                  <tr className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    <th className="text-left px-3 py-2.5 min-w-[240px]">Produto</th>
                    <th className="text-left px-3 py-2.5 w-16">Un.</th>
                    <th className="text-left px-3 py-2.5 w-28">Qtde</th>
                    {tipo === "REQUISICAO" && <>
                      <th className="text-left px-3 py-2.5 min-w-[140px]">Centro de Custo</th>
                      <th className="text-left px-3 py-2.5 min-w-[150px]">Natureza</th>
                      <th className="text-left px-3 py-2.5 w-24">O.S.</th>
                      <th className="text-left px-3 py-2.5 w-24">Requisição</th>
                    </>}
                    <th className="text-left px-3 py-2.5 w-28">Localização</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row._key} className="hover:bg-muted">
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
                          <ComboboxWithCreate value={row.centroCustoId} onChange={(v) => updateRow(row._key, "centroCustoId", v)}
                            placeholder="—" noneLabel="—" triggerClassName="h-8 rounded-md text-xs"
                            options={centros.map((c) => ({ value: c.id, label: c.codigo }))} />
                          {submitted && (() => { const it = itensCat.find((i) => i.id === row.itemId); return it?.fabril === true && it?.capitaliza !== true && !(row.centroCustoId || centroCustoId); })() && (
                            <p className="text-[10px] text-red-500 mt-0.5">centro obrigatório (indireto)</p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <ComboboxWithCreate value={row.naturezaFinanceiraId} onChange={(v) => updateRow(row._key, "naturezaFinanceiraId", v)}
                            placeholder="—" noneLabel="—" triggerClassName="h-8 rounded-md text-xs"
                            options={naturezas.map((n) => ({ value: n.id, label: `${n.nome}${n.cif ? " · CIF" : ""}` }))} />
                          {submitted && row.itemId && !(row.naturezaFinanceiraId || naturezaFinanceiraId) && (
                            <p className="text-[10px] text-red-500 mt-0.5">natureza obrigatória</p>
                          )}
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
                        <button onClick={() => setRows((p) => p.filter((r) => r._key !== row._key))} className="text-muted-foreground hover:text-red-500 transition-colors">
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
          <Button variant="ghost" onClick={voltar} disabled={saving}>
            Cancelar
          </Button>
        </div>
      </div>
      {createdDialog}
    </div>
  );
}
