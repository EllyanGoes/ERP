"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Save, Filter, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { useVoltarCriacao } from "@/components/shared/CreateDrawer";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";

type LocalEstoqueOpt = { id: string; nome: string };
type ColaboradorOpt  = { id: string; nome: string; setorId: string | null };
type FornecedorOpt   = { id: string; razaoSocial: string; nomeFantasia: string | null };
type LastPurchase    = { vlrUnitario: unknown; conferencia: { fornecedorId: string | null; fornecedor: FornecedorOpt | null } | null } | null;
type ItemOpt         = { id: string; codigo: string; descricao: string; unidadeMedida: string; tipo: string; precoCusto: unknown; unidade: { sigla: string } | null; conferenciaCompraItens: LastPurchase[] };
type EstoqueItemOpt  = { id: string; quantidadeAtual: unknown; localizacao: string | null; item: ItemOpt };

type SampleRow = {
  _key:         string;
  itemId:       string;
  item:         ItemOpt | null;
  localizacao:  string;
  saldoSistema: string;
  custoUnitario: string;
  fornecedorId:  string;
};

function toNum(v: unknown) { return v == null ? 0 : parseFloat(String(v)); }

const TIPO_ITEM_OPTIONS: { id: string; nome: string }[] = [
  { id: "PRODUTO",       nome: "Produto" },
  { id: "MATERIA_PRIMA", nome: "Matéria-Prima" },
  { id: "SERVICO",       nome: "Serviço" },
];

const ACTIVE_TAB_CLS = "border-b-2 border-indigo-600 text-indigo-700 font-medium";
const INACTIVE_TAB_CLS = "border-b-2 border-transparent text-gray-500 hover:text-gray-800";

/* Portal-based single select */
function PortalSelect<T extends { id: string }>({
  options, value, onChange, placeholder, getLabel, error,
}: {
  options: T[]; value: string; onChange: (id: string) => void;
  placeholder: string; getLabel: (item: T) => string; error?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const selected = options.find((o) => o.id === value);
  function openDropdown() {
    if (containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width });
    }
    setOpen(true); setQuery("");
  }
  const filtered = options.filter((o) => !query || getLabel(o).toLowerCase().includes(query.toLowerCase()));
  const dropdown = open && mounted && pos ? createPortal(
    <div className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
      style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: 220 }}>
      <div className="p-1.5 border-b border-gray-100">
        <input autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar..." className="w-full px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400" />
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 160 }}>
        <button type="button" onMouseDown={() => { onChange(""); setOpen(false); }}
          className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 border-b border-gray-50">{placeholder}</button>
        {filtered.map((o) => (
          <button key={o.id} type="button" onMouseDown={() => { onChange(o.id); setOpen(false); }}
            className={cn("w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0", value === o.id && "bg-indigo-50 text-indigo-700")}>
            {getLabel(o)}
          </button>
        ))}
        {filtered.length === 0 && <p className="px-3 py-2 text-sm text-gray-400 italic">Nenhum resultado.</p>}
      </div>
    </div>, document.body) : null;
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);
  return (
    <div ref={containerRef} className="relative">
      <button type="button" onClick={openDropdown}
        className={cn("w-full h-9 px-3 text-sm text-left border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 flex items-center justify-between",
          error ? "border-red-300" : "border-gray-200", !selected && "text-gray-400")}>
        <span className={selected ? "text-gray-900" : "text-gray-400"}>{selected ? getLabel(selected) : placeholder}</span>
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {dropdown}
    </div>
  );
}

/* Portal-based multi-select with checkboxes */
function PortalMultiSelect<T extends { id: string }>({
  options, values, onChange, placeholder, getLabel,
}: {
  options: T[]; values: string[]; onChange: (ids: string[]) => void;
  placeholder: string; getLabel: (item: T) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  function openDropdown() {
    if (containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width });
    }
    setOpen(true); setQuery("");
  }

  function toggle(id: string) {
    onChange(values.includes(id) ? values.filter((v) => v !== id) : [...values, id]);
  }

  const filtered = options.filter((o) => !query || getLabel(o).toLowerCase().includes(query.toLowerCase()));

  const triggerLabel = values.length === 0
    ? placeholder
    : values.length === 1
      ? getLabel(options.find((o) => o.id === values[0])!) || placeholder
      : `${values.length} selecionados`;

  const dropdown = open && mounted && pos ? createPortal(
    <div className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
      style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: 260 }}>
      <div className="p-1.5 border-b border-gray-100">
        <input autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar..." className="w-full px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400" />
      </div>
      {values.length > 0 && (
        <div className="px-3 py-1.5 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs text-indigo-600 font-medium">{values.length} selecionado(s)</span>
          <button type="button" onMouseDown={() => onChange([])} className="text-xs text-gray-400 hover:text-red-500">Limpar</button>
        </div>
      )}
      <div className="overflow-y-auto" style={{ maxHeight: 180 }}>
        {filtered.length === 0
          ? <p className="px-3 py-2 text-sm text-gray-400 italic">Nenhum resultado.</p>
          : filtered.map((o) => {
            const checked = values.includes(o.id);
            return (
              <button key={o.id} type="button" onMouseDown={() => toggle(o.id)}
                className={cn("w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0",
                  checked && "bg-indigo-50")}>
                <span className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0",
                  checked ? "bg-indigo-600 border-indigo-600" : "border-gray-300")}>
                  {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>}
                </span>
                <span className={checked ? "text-indigo-700 font-medium" : "text-gray-700"}>{getLabel(o)}</span>
              </button>
            );
          })
        }
      </div>
    </div>, document.body) : null;

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button type="button" onClick={openDropdown}
        className={cn("w-full h-9 px-3 text-sm text-left border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 flex items-center justify-between",
          values.length === 0 && "text-gray-400")}>
        <span className={values.length > 0 ? "text-gray-900" : "text-gray-400"}>{triggerLabel}</span>
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {dropdown}
    </div>
  );
}

export default function InventarioCreateForm() {
  const voltar       = useVoltarCriacao("/suprimentos/inventarios-materiais");
  const { confirmCreated, dialog: createdDialog } = useCreateFlow({
    entity: "inventário",
    onNew: () => { window.location.href = "/suprimentos/inventarios-materiais/nova"; },
    viewHref: (id) => `/suprimentos/inventarios-materiais/${id}`,
  });
  const searchParams = useSearchParams();

  const [localEstoqueId, setLocalEstoqueId] = useState(searchParams.get("localEstoqueId") ?? "");
  const [colaboradorId,  setColaboradorId]  = useState("");
  const [data,           setData]           = useState(() => new Date().toISOString().split("T")[0]);
  const [observacoes,    setObservacoes]    = useState("");
  const [submitted,      setSubmitted]      = useState(false);

  const [activeTab, setActiveTab] = useState<"filtros" | "amostragem">("filtros");

  const [filtroTipos,    setFiltroTipos]    = useState<string[]>([]);
  const [filtroItemIds,  setFiltroItemIds]  = useState<string[]>([]);

  const [rows, setRows] = useState<SampleRow[]>([]);

  const [locais,        setLocais]        = useState<LocalEstoqueOpt[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorOpt[]>([]);
  const [fornecedores,  setFornecedores]  = useState<FornecedorOpt[]>([]);
  const [estoqueItens,  setEstoqueItens]  = useState<EstoqueItemOpt[]>([]);

  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadOptions = useCallback(async () => {
    const [lRes, cRes, fRes] = await Promise.all([
      fetch("/api/suprimentos/locais-estoque?ativo=true"),
      fetch("/api/empresa/colaboradores?ativo=true"),
      fetch("/api/suprimentos/fornecedores?ativo=true"),
    ]);
    setLocais((await lRes.json()) || []);
    const cData = await cRes.json();
    setColaboradores(Array.isArray(cData) ? cData : Array.isArray(cData.data) ? cData.data : []);
    const fData = await fRes.json();
    setFornecedores(Array.isArray(fData) ? fData : Array.isArray(fData.data) ? fData.data : []);
  }, []);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  useEffect(() => {
    if (!localEstoqueId) { setEstoqueItens([]); return; }
    fetch(`/api/suprimentos/locais-estoque/${localEstoqueId}`)
      .then(r => r.json())
      .then((d) => setEstoqueItens(d.estoqueItens ?? []));
  }, [localEstoqueId]);

  function buildRow(e: EstoqueItemOpt): SampleRow {
    const lastPurchase = e.item.conferenciaCompraItens?.[0] ?? null;
    const lastCusto = lastPurchase?.vlrUnitario != null
      ? String(parseFloat(String(lastPurchase.vlrUnitario)))
      : e.item.precoCusto != null ? String(parseFloat(String(e.item.precoCusto))) : "";
    const lastFornecedorId = lastPurchase?.conferencia?.fornecedorId ?? "";
    return {
      _key:          e.id,
      itemId:        e.item.id,
      item:          e.item,
      localizacao:   e.localizacao ?? "",
      saldoSistema:  String(toNum(e.quantidadeAtual)),
      custoUnitario: lastCusto,
      fornecedorId:  lastFornecedorId,
    };
  }

  function handleFiltrarAmostragem() {
    let base = estoqueItens;
    if (filtroTipos.length > 0)   base = base.filter(e => filtroTipos.includes(e.item.tipo));
    if (filtroItemIds.length > 0) base = base.filter(e => filtroItemIds.includes(e.item.id));
    setRows(base.map(buildRow));
    setActiveTab("amostragem");
  }

  function handleFiltrarPendentes() {
    const base = estoqueItens.filter(e => toNum(e.quantidadeAtual) > 0);
    setRows(base.map(buildRow));
    setActiveTab("amostragem");
  }

  function updateRow(key: string, field: keyof SampleRow, value: string) {
    setRows(p => p.map(r => r._key === key ? { ...r, [field]: value } : r));
  }

  async function handleSave(statusFinal: "RASCUNHO" | "EM_ANDAMENTO") {
    setSubmitted(true);
    if (!localEstoqueId) { setSaveError("Local de Estoque é obrigatório"); return; }
    if (!data) { setSaveError("Data é obrigatória"); return; }
    setSaving(true); setSaveError("");
    try {
      const res = await fetch("/api/suprimentos/inventarios-materiais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localEstoqueId,
          colaboradorId: colaboradorId || null,
          data,
          observacoes: observacoes || null,
        }),
      });
      if (!res.ok) { setSaveError((await res.json()).error || "Erro ao salvar"); setSaving(false); return; }
      const { data: created } = await res.json();

      if (rows.length > 0) {
        await fetch(`/api/suprimentos/inventarios-materiais/${created.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: statusFinal,
            itens: rows.map(r => ({
              itemId:        r.itemId,
              localizacao:   r.localizacao || null,
              saldoSistema:  parseFloat(r.saldoSistema) || 0,
              saldoFisico:   null,
              diferenca:     null,
              custoUnitario: r.custoUnitario ? parseFloat(r.custoUnitario) : null,
              fornecedorId:  r.fornecedorId  || null,
            })),
          }),
        });
      } else if (statusFinal === "EM_ANDAMENTO") {
        await fetch(`/api/suprimentos/inventarios-materiais/${created.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: statusFinal }),
        });
      }

      confirmCreated(created.id);
    } catch (e) {
      setSaveError(String(e));
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="space-y-6 max-w-4xl">

        {/* ── Dados do Inventário ──────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dados do Inventário</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">
                  Local de Estoque <span className="text-red-500">*</span>
                </Label>
                <PortalSelect
                  options={locais}
                  value={localEstoqueId}
                  onChange={setLocalEstoqueId}
                  placeholder="Selecione..."
                  getLabel={(l) => l.nome}
                  error={submitted && !localEstoqueId}
                />
                {submitted && !localEstoqueId && (
                  <p className="text-xs text-red-500">Campo obrigatório</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Responsável</Label>
                <ComboboxWithCreate
                  options={colaboradores.map((c) => ({ value: c.id, label: c.nome }))}
                  value={colaboradorId}
                  onChange={setColaboradorId}
                  placeholder="Buscar colaborador..."
                  allowNone
                  createHref="/empresa/colaboradores/novo"
                  createLabel="colaborador"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">
                  Data do Inventário <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className={cn("h-9", submitted && !data && "border-red-300")}
                />
              </div>

            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Observações</Label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Amostragem ───────────────────────────────────────────────── */}
        <Card className="overflow-hidden">
          <div className="border-b border-gray-100 px-4">
            <nav className="flex gap-0">
              {([
                { key: "filtros",    label: "Filtros de Amostragem" },
                { key: "amostragem", label: `Amostragem${rows.length > 0 ? ` (${rows.length})` : ""}` },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={cn("px-4 py-3 text-sm transition-colors", activeTab === t.key ? ACTIVE_TAB_CLS : INACTIVE_TAB_CLS)}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          {activeTab === "filtros" && (
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-400">Defina os filtros para selecionar os materiais que serão inventariados.</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Produto</Label>
                  <PortalMultiSelect
                    options={estoqueItens.map((e) => ({ id: e.item.id, nome: e.item.descricao, codigo: e.item.codigo }))}
                    values={filtroItemIds}
                    onChange={setFiltroItemIds}
                    placeholder="Todos os produtos"
                    getLabel={(o) => `${o.codigo} — ${o.nome}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Tipo de Produto</Label>
                  <PortalMultiSelect
                    options={TIPO_ITEM_OPTIONS}
                    values={filtroTipos}
                    onChange={setFiltroTipos}
                    placeholder="Todos os tipos"
                    getLabel={(o) => o.nome}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button size="sm" variant="outline" onClick={handleFiltrarAmostragem} disabled={!localEstoqueId}>
                  <Filter className="w-3.5 h-3.5 mr-1.5" />Filtrar Amostragem
                </Button>
                <Button size="sm" variant="outline" onClick={handleFiltrarPendentes} disabled={!localEstoqueId}>
                  <Filter className="w-3.5 h-3.5 mr-1.5" />Materiais com saldo
                </Button>
              </div>
              {!localEstoqueId && (
                <p className="text-xs text-amber-600">Selecione um Local de Estoque para usar os filtros.</p>
              )}
            </div>
          )}

          {activeTab === "amostragem" && (
            <div>
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-xs text-gray-500">{rows.length} material(is) na amostragem</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRows(p => [...p, {
                    _key: Math.random().toString(36).slice(2),
                    itemId: "", item: null, localizacao: "", saldoSistema: "0",
                    custoUnitario: "", fornecedorId: "",
                  }])}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />Adicionar
                </Button>
              </div>
              {rows.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-sm">Nenhum material na amostragem.</p>
                  <p className="text-xs mt-1">Use os filtros na aba anterior para adicionar materiais.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-xs text-gray-400 uppercase tracking-wide">
                        <th className="text-left px-4 py-2.5 font-medium">Material</th>
                        <th className="text-left px-4 py-2.5 font-medium">Unidade</th>
                        <th className="text-left px-4 py-2.5 font-medium">Fornecedor</th>
                        <th className="text-right px-4 py-2.5 font-medium">Custo Unit.</th>
                        <th className="text-left px-4 py-2.5 font-medium">Localização</th>
                        <th className="text-right px-4 py-2.5 font-medium">Saldo Sistema</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((r) => (
                        <tr key={r._key}>
                          <td className="px-4 py-2.5">
                            {r.item ? (
                              <div>
                                <span className="text-gray-800">{r.item.descricao}</span>
                                <span className="text-xs text-gray-400 ml-2 font-mono">{r.item.codigo}</span>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">
                            {r.item?.unidade?.sigla ?? r.item?.unidadeMedida ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 min-w-[180px]">
                            <PortalSelect
                              options={fornecedores}
                              value={r.fornecedorId}
                              onChange={(v) => updateRow(r._key, "fornecedorId", v)}
                              placeholder="— Fornecedor —"
                              getLabel={(f) => f.nomeFantasia ?? f.razaoSocial}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Input
                              type="number"
                              step="0.01"
                              value={r.custoUnitario}
                              onChange={(e) => updateRow(r._key, "custoUnitario", e.target.value)}
                              className="h-7 text-xs w-28 ml-auto"
                              placeholder="0,00"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <Input
                              value={r.localizacao}
                              onChange={(e) => updateRow(r._key, "localizacao", e.target.value)}
                              className="h-7 text-xs w-28"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Input
                              type="number"
                              step="0.001"
                              value={r.saldoSistema}
                              onChange={(e) => updateRow(r._key, "saldoSistema", e.target.value)}
                              className="h-7 text-xs w-24 ml-auto"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <button
                              onClick={() => setRows(p => p.filter(x => x._key !== r._key))}
                              className="text-red-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>

        {saveError && <p className="text-sm text-red-600">{saveError}</p>}

        <div className="flex items-center gap-3">
          <Button
            onClick={() => handleSave("EM_ANDAMENTO")}
            disabled={saving || !localEstoqueId || !data}
          >
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Iniciar Inventário
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSave("RASCUNHO")}
            disabled={saving || !localEstoqueId || !data}
          >
            Salvar Rascunho
          </Button>
          <Button
            variant="ghost"
            onClick={voltar}
            disabled={saving}
          >
            Cancelar
          </Button>
        </div>
      </div>
      {createdDialog}
    </div>
  );
}
