"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus, Trash2, Save, X, Search, Loader2,
  CheckCircle2, XCircle, Tag, Pencil,
} from "lucide-react";
import { cn, formatBRL, decimalToNumber } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";

// ── Types ──────────────────────────────────────────────────────────────────────

type ItemOpt = {
  id: string; codigo: string; descricao: string;
  unidadeMedida: string; precoVenda: unknown;
};

type ItemRow = {
  _key: string;
  itemId: string;
  codigo: string;
  descricao: string;
  unidadeMedida: string;
  grupo: string;
  precoBase: string;
  precoVenda: string;
  vlrDesconto: string;
  ativo: boolean;
  fator: string;
  tipoOperacao: string;
  faixa: string;
  moeda: string;
};

type TabelaPreco = {
  id: string;
  codigo: string;
  descricao: string;
  dataInicial: string;
  dataFinal: string | null;
  condicaoPagamento: string | null;
  tipoHorario: string;
  ativa: boolean;
  ecommerce: boolean;
  observacoes: string | null;
  itens: Array<{
    id: string; sequencia: number; itemId: string | null; grupo: string | null;
    precoBase: unknown; precoVenda: unknown; vlrDesconto: unknown;
    ativo: boolean; fator: unknown; tipoOperacao: string | null;
    faixa: unknown; moeda: string;
    item: ItemOpt | null;
  }>;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Formata número com 4 casas decimais no padrão pt-BR: 1.234,5678 */
function formatPrice4(v: string | number): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "0,0000";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(n);
}

/** Converte string pt-BR "1.234,5678" → "1234.5678" para armazenar */
function parsePrice(s: string): string {
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? "0" : String(n);
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function emptyRow(): ItemRow {
  return {
    _key: crypto.randomUUID(),
    itemId: "", codigo: "", descricao: "", unidadeMedida: "",
    grupo: "", precoBase: "0", precoVenda: "0", vlrDesconto: "0",
    ativo: true, fator: "0", tipoOperacao: "Todos",
    faixa: "999999.99", moeda: "BRL",
  };
}

function rowFromDB(it: TabelaPreco["itens"][number]): ItemRow {
  return {
    _key:         crypto.randomUUID(),
    itemId:       it.itemId ?? "",
    codigo:       it.item?.codigo ?? "",
    descricao:    it.item?.descricao ?? it.grupo ?? "",
    unidadeMedida: it.item?.unidadeMedida ?? "",
    grupo:        it.grupo ?? "",
    precoBase:    decimalToNumber(it.precoBase).toFixed(4),
    precoVenda:   decimalToNumber(it.precoVenda).toFixed(4),
    vlrDesconto:  decimalToNumber(it.vlrDesconto).toFixed(4),
    ativo:        it.ativo,
    fator:        decimalToNumber(it.fator).toFixed(4),
    tipoOperacao: it.tipoOperacao ?? "Todos",
    faixa:        it.faixa != null ? decimalToNumber(it.faixa).toFixed(2) : "999999.99",
    moeda:        it.moeda,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TabelaPrecoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [tabela, setTabela] = useState<TabelaPreco | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveError,   setSaveError]   = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dirty,       setDirty]       = useState(false);
  const [editing,     setEditing]     = useState(false);

  // Header form
  const [form, setForm] = useState({
    descricao: "", dataInicial: "", dataFinal: "",
    condicaoPagamento: "", tipoHorario: "UNICO",
    ativa: true, ecommerce: false, observacoes: "",
  });

  // Items
  const [itens, setItens] = useState<ItemRow[]>([]);

  // Item search popover (portal)
  const [searchRow,    setSearchRow]    = useState<string | null>(null);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [searchResults,setSearchResults]= useState<ItemOpt[]>([]);
  const [searching,    setSearching]    = useState(false);
  const [searchDropPos,setSearchDropPos]= useState<{ top: number; left: number; width: number } | null>(null);
  const [portalMounted,setPortalMounted]= useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useTabTitle(tabela ? `TP-${tabela.codigo}` : "Tabela de Preço");
  useEffect(() => { setPortalMounted(true); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/comercial/tabelas-preco/${id}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Não encontrado"); return; }
      const t: TabelaPreco = json.data;
      setTabela(t);
      setForm({
        descricao:         t.descricao,
        dataInicial:       toDateInput(t.dataInicial),
        dataFinal:         toDateInput(t.dataFinal),
        condicaoPagamento: t.condicaoPagamento ?? "",
        tipoHorario:       t.tipoHorario,
        ativa:             t.ativa,
        ecommerce:         t.ecommerce,
        observacoes:       t.observacoes ?? "",
      });
      setItens(t.itens.map(rowFromDB));
      setDirty(false);
    } catch { setError("Erro ao carregar"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Close item search on outside click or scroll
  useEffect(() => {
    if (!searchRow) return;
    function handle(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-prod-search]"))
        closeSearch();
    }
    function onScroll(e: Event) {
      if ((e.target as HTMLElement).closest?.("[data-prod-search]")) return;
      closeSearch();
    }
    document.addEventListener("mousedown", handle);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", handle);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [searchRow]); // eslint-disable-line react-hooks/exhaustive-deps

  function closeSearch() {
    setSearchRow(null);
    setSearchDropPos(null);
    setSearchQuery("");
  }

  function openSearch(key: string, triggerEl: HTMLElement, initialQ: string) {
    const r = triggerEl.getBoundingClientRect();
    setSearchDropPos({
      top:   r.bottom + window.scrollY + 4,
      left:  r.left   + window.scrollX,
      width: Math.max(r.width, 340),
    });
    setSearchRow(key);
    setSearchQuery(initialQ);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  // Search products
  useEffect(() => {
    if (!searchRow) return;
    const delay = searchQuery.trim() ? 300 : 0;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const q = searchQuery.trim();
        const res = await fetch(`/api/suprimentos/produtos?vendavel=true&q=${encodeURIComponent(q)}&limit=20`);
        const json = await res.json();
        setSearchResults(json.data ?? []);
      } catch { /* ignore */ }
      finally { setSearching(false); }
    }, delay);
    return () => clearTimeout(t);
  }, [searchQuery, searchRow]);

  function updateItem(key: string, field: keyof ItemRow, value: unknown) {
    setItens((prev) => prev.map((r) => r._key === key ? { ...r, [field]: value } : r));
    setDirty(true);
  }

  function addRow() {
    setItens((prev) => [...prev, emptyRow()]);
    setDirty(true);
  }

  function removeRow(key: string) {
    setItens((prev) => prev.filter((r) => r._key !== key));
    setDirty(true);
  }

  function selectProduct(key: string, prod: ItemOpt) {
    setItens((prev) => prev.map((r) => r._key !== key ? r : {
      ...r,
      itemId:       prod.id,
      codigo:       prod.codigo,
      descricao:    prod.descricao,
      unidadeMedida: prod.unidadeMedida,
      precoBase:    decimalToNumber(prod.precoVenda).toFixed(4),
      precoVenda:   decimalToNumber(prod.precoVenda).toFixed(4),
    }));
    closeSearch();
    setSearchQuery("");
    setDirty(true);
  }

  async function handleSave() {
    if (!form.descricao.trim()) { setSaveError("Descrição obrigatória"); return; }
    if (!form.dataInicial)      { setSaveError("Data Inicial obrigatória"); return; }
    setSaving(true); setSaveError(""); setSaveSuccess(false);
    try {
      const payload = {
        ...form,
        dataInicial: form.dataInicial || null,
        dataFinal:   form.dataFinal   || null,
        itens: itens.map((r, idx) => ({
          sequencia:    idx + 1,
          itemId:       r.itemId || null,
          grupo:        r.grupo || null,
          precoBase:    parseFloat(r.precoBase)   || 0,
          precoVenda:   parseFloat(r.precoVenda)  || 0,
          vlrDesconto:  parseFloat(r.vlrDesconto) || 0,
          ativo:        r.ativo,
          fator:        parseFloat(r.fator) || 0,
          tipoOperacao: r.tipoOperacao || null,
          faixa:        r.faixa ? parseFloat(r.faixa) : null,
          moeda:        r.moeda || "BRL",
        })),
      };
      const res = await fetch(`/api/comercial/tabelas-preco/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setSaveError(json.error || "Erro ao salvar"); return; }
      const t: TabelaPreco = json.data;
      setTabela(t);
      setItens(t.itens.map(rowFromDB));
      setDirty(false);
      setEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch { setSaveError("Erro de conexão"); }
    finally { setSaving(false); }
  }

  async function handleCancelEdit() {
    await load();
    setEditing(false);
    setSaveError("");
    setDirty(false);
  }

  async function handleDelete() {
    if (!confirm(`Excluir tabela TP-${tabela?.codigo}? Esta ação não pode ser desfeita.`)) return;
    await fetch(`/api/comercial/tabelas-preco/${id}`, { method: "DELETE" });
    router.push("/comercial/tabelas-preco");
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );
  if (!tabela) return <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>;

  return (
    <div>
      <PageHeader
        title={`Tabela de Preço — ${tabela.codigo}`}
        breadcrumbs={[
          { label: "Comercial" },
          { label: "Tabelas de Preço", href: "/comercial/tabelas-preco" },
          { label: tabela.codigo },
        ]}
        action={
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                {dirty && (
                  <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md">
                    Alterações não salvas
                  </span>
                )}
                <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={saving}>
                  <X className="w-3.5 h-3.5 mr-1" /> Cancelar
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                  Salvar
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => router.push("/comercial/tabelas-preco")}>
                  <X className="w-3.5 h-3.5 mr-1" /> Fechar
                </Button>
                <Button size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="px-8 pb-8 max-w-6xl space-y-6">
        {saveSuccess && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm font-medium">
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
            Alterações salvas com sucesso!
          </div>
        )}
        {saveError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            <XCircle className="w-4 h-4 shrink-0" />
            {saveError}
          </div>
        )}

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-gray-800">Dados da Tabela</h2>
            <div className="flex items-center gap-4">
              {editing ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox" checked={form.ativa}
                    onChange={(e) => { setForm((f) => ({ ...f, ativa: e.target.checked })); setDirty(true); }}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-sm text-gray-700 flex items-center gap-1">
                    {form.ativa ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-gray-300" />}
                    Tab. Ativa
                  </span>
                </label>
              ) : (
                <span className={cn(
                  "flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full",
                  form.ativa ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                )}>
                  {form.ativa ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {form.ativa ? "Ativa" : "Inativa"}
                </span>
              )}
            </div>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Cód. Tabela</Label>
              <Input value={tabela.codigo} readOnly className="bg-gray-50 font-mono font-semibold" />
            </div>
            <div className="col-span-3 space-y-1">
              <Label className="text-xs text-gray-500">Descrição</Label>
              {editing ? (
                <Input
                  value={form.descricao}
                  onChange={(e) => { setForm((f) => ({ ...f, descricao: e.target.value })); setDirty(true); }}
                  placeholder="Descrição da tabela"
                />
              ) : (
                <p className="text-sm font-medium text-gray-900 py-1">{form.descricao || "—"}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Data Inicial</Label>
              {editing ? (
                <Input
                  type="date" value={form.dataInicial}
                  onChange={(e) => { setForm((f) => ({ ...f, dataInicial: e.target.value })); setDirty(true); }}
                />
              ) : (
                <p className="text-sm text-gray-800 py-1">
                  {form.dataInicial ? new Date(form.dataInicial + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Data Final</Label>
              {editing ? (
                <Input
                  type="date" value={form.dataFinal}
                  onChange={(e) => { setForm((f) => ({ ...f, dataFinal: e.target.value })); setDirty(true); }}
                />
              ) : (
                <p className="text-sm text-gray-800 py-1">
                  {form.dataFinal ? new Date(form.dataFinal + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Items grid ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-gray-800">Itens da Tabela</h2>
            {editing && (
              <Button size="sm" variant="outline" onClick={addRow}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Item
              </Button>
            )}
          </div>

          {itens.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-gray-400 gap-3">
              <Tag className="w-10 h-10 opacity-25" />
              <p className="text-sm">Nenhum item na tabela</p>
              {editing && (
                <Button size="sm" variant="outline" onClick={addRow}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Item
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-center px-3 py-2.5 font-semibold w-12">#</th>
                    <th className="text-left px-3 py-2.5 font-semibold w-28">Cód. Produto</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Descrição</th>
                    <th className="text-center px-3 py-2.5 font-semibold w-14">U.M.</th>
                    <th className="text-right px-3 py-2.5 font-semibold w-32">Preço Venda</th>
                    <th className="text-right px-3 py-2.5 font-semibold w-32">Vlr. Desconto</th>
                    {editing && <th className="w-10 px-2 py-2.5" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {itens.map((row, idx) => (
                    <tr key={row._key} className="hover:bg-gray-50/60 group">
                      {/* # */}
                      <td className="px-3 py-2 text-center text-xs font-mono text-gray-400">
                        {String(idx + 1).padStart(4, "0")}
                      </td>

                      {/* Cód. Produto */}
                      <td className="px-3 py-2">
                        {editing ? (
                          <button
                            data-prod-search
                            type="button"
                            onClick={(e) => openSearch(row._key, e.currentTarget, row.codigo)}
                            className={cn(
                              "w-full h-7 px-2 rounded border text-left text-xs font-mono transition-colors",
                              row.codigo
                                ? "border-gray-200 bg-white text-gray-800 hover:border-blue-400"
                                : "border-dashed border-gray-300 text-gray-400 hover:border-blue-400",
                              searchRow === row._key && "border-blue-400 ring-1 ring-blue-200"
                            )}
                          >
                            {row.codigo || <span className="flex items-center gap-1"><Search className="w-3 h-3" />Buscar</span>}
                          </button>
                        ) : (
                          <span className="text-xs font-mono font-semibold text-gray-700">{row.codigo || "—"}</span>
                        )}
                      </td>

                      {/* Descrição — sempre read-only */}
                      <td className="px-3 py-2">
                        <span className="text-xs text-gray-800">{row.descricao || "—"}</span>
                      </td>

                      {/* U.M. — sempre read-only */}
                      <td className="px-3 py-2 text-center">
                        <span className="text-xs font-semibold font-mono text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                          {row.unidadeMedida || "—"}
                        </span>
                      </td>

                      {/* Preço Venda */}
                      <td className="px-3 py-2 text-right">
                        {editing ? (
                          <input
                            type="text"
                            defaultValue={formatPrice4(row.precoVenda)}
                            key={row._key + "-pv-" + row.precoVenda}
                            onFocus={(e) => { e.target.value = row.precoVenda === "0" ? "" : row.precoVenda; }}
                            onBlur={(e) => {
                              const raw = parsePrice(e.target.value || "0");
                              updateItem(row._key, "precoVenda", raw);
                              e.target.value = formatPrice4(raw);
                            }}
                            className="h-7 w-full rounded-md border border-gray-200 px-2 text-xs text-right font-mono bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                          />
                        ) : (
                          <span className="text-xs font-mono font-medium text-gray-800 tabular-nums">{formatPrice4(row.precoVenda)}</span>
                        )}
                      </td>

                      {/* Vlr. Desconto */}
                      <td className="px-3 py-2 text-right">
                        {editing ? (
                          <input
                            type="text"
                            defaultValue={formatPrice4(row.vlrDesconto)}
                            key={row._key + "-vd-" + row.vlrDesconto}
                            onFocus={(e) => { e.target.value = row.vlrDesconto === "0" ? "" : row.vlrDesconto; }}
                            onBlur={(e) => {
                              const raw = parsePrice(e.target.value || "0");
                              updateItem(row._key, "vlrDesconto", raw);
                              e.target.value = formatPrice4(raw);
                            }}
                            className="h-7 w-full rounded-md border border-gray-200 px-2 text-xs text-right font-mono bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                          />
                        ) : (
                          <span className="text-xs font-mono text-gray-600 tabular-nums">{formatPrice4(row.vlrDesconto)}</span>
                        )}
                      </td>

                      {/* Remove — só em modo edição */}
                      {editing && (
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => removeRow(row._key)}
                            className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                  <tr>
                    <td colSpan={editing ? 7 : 6} className="px-4 py-2 text-xs text-gray-400">
                      {itens.length} {itens.length === 1 ? "item" : "itens"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── Observações ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Observações</h2>
          </div>
          <div className="p-4">
            {editing ? (
              <textarea
                value={form.observacoes}
                onChange={(e) => { setForm((f) => ({ ...f, observacoes: e.target.value })); setDirty(true); }}
                rows={3}
                placeholder="Observações adicionais..."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <p className="text-sm text-gray-600 whitespace-pre-wrap min-h-[48px]">
                {form.observacoes || <span className="text-gray-400 italic">Sem observações</span>}
              </p>
            )}
          </div>
        </div>

        {/* ── Portal: product search dropdown ─────────────────────────────── */}
        {portalMounted && searchRow && searchDropPos && createPortal(
          <div
            data-prod-search
            className="fixed z-[9999] bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden"
            style={{ top: searchDropPos.top, left: searchDropPos.left, width: searchDropPos.width }}
          >
            <div className="relative border-b border-gray-100">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                data-prod-search
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Código ou descrição..."
                className="w-full pl-8 pr-3 py-2.5 text-sm focus:outline-none bg-transparent"
              />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {(() => {
                // IDs já na tabela, exceto a linha sendo editada agora
                const usedIds = new Set(
                  itens.filter((r) => r._key !== searchRow && r.itemId).map((r) => r.itemId)
                );
                const available = searchResults.filter((p) => !usedIds.has(p.id));
                if (searching) return (
                  <div className="flex items-center justify-center py-4 gap-1.5 text-xs text-gray-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando...
                  </div>
                );
                if (available.length === 0) return (
                  <p className="px-4 py-3 text-xs text-gray-400 italic text-center">
                    {searchResults.length > 0 ? "Todos os produtos já foram adicionados" : "Nenhum produto encontrado"}
                  </p>
                );
                return available.map((p) => (
                  <button
                    key={p.id}
                    data-prod-search
                    type="button"
                    onMouseDown={() => selectProduct(searchRow, p)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-blue-50 text-left border-b border-gray-50 last:border-0"
                  >
                    <span className="font-mono text-xs text-gray-500 shrink-0 w-20">{p.codigo}</span>
                    <span className="text-sm text-gray-800 truncate flex-1">{p.descricao}</span>
                    <span className="text-xs text-gray-400 shrink-0">{p.unidadeMedida}</span>
                    <span className="text-xs font-medium text-blue-600 shrink-0">{formatBRL(decimalToNumber(p.precoVenda))}</span>
                  </button>
                ));
              })()}
            </div>
          </div>,
          document.body
        )}

        {/* ── Danger zone — só em modo edição ─────────────────────────────── */}
        {editing && (
          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={handleDelete}
              className="text-xs text-red-400 hover:text-red-600 transition-colors"
            >
              Excluir tabela
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
