"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Autoria } from "@/components/shared/Autoria";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DatePicker from "@/components/shared/DatePicker";
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
  unidadeMedida: string; precoVenda: unknown; precoCusto?: unknown;
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
  markupPct: string;      // "" = preço manual
  custo: number | null;   // CMPM da empresa da tabela (read-only, vem do GET)
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
  markupPadrao: unknown;
  observacoes: string | null;
  criadoPor?: string | null;
  atualizadoPor?: string | null;
  custos?: Record<string, number | null>; // custo ATUAL por itemId (empresa da tabela)
  itens: Array<{
    id: string; sequencia: number; itemId: string | null; grupo: string | null;
    precoBase: unknown; precoVenda: unknown; vlrDesconto: unknown; markupPct: unknown;
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

/** Formata percentual com até 2 casas: 30 → "30", 12.5 → "12,5" */
function formatPct(v: string | number): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
}

/** Preço de venda a partir do custo e do markup %: custo × (1 + m/100) */
function precoPorMarkup(custo: number, markupPct: number): string {
  return (custo * (1 + markupPct / 100)).toFixed(4);
}

function emptyRow(): ItemRow {
  return {
    _key: crypto.randomUUID(),
    itemId: "", codigo: "", descricao: "", unidadeMedida: "",
    grupo: "", precoBase: "0", precoVenda: "0", vlrDesconto: "0",
    markupPct: "", custo: null,
    ativo: true, fator: "0", tipoOperacao: "Todos",
    faixa: "999999.99", moeda: "BRL",
  };
}

function rowFromDB(it: TabelaPreco["itens"][number], custos: Record<string, number | null>): ItemRow {
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
    markupPct:    it.markupPct != null ? String(decimalToNumber(it.markupPct)) : "",
    custo:        it.itemId ? (custos[it.itemId] ?? null) : null,
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
    ativa: true, ecommerce: false, markupPadrao: "", observacoes: "",
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
        markupPadrao:      t.markupPadrao != null ? String(decimalToNumber(t.markupPadrao)) : "",
        observacoes:       t.observacoes ?? "",
      });
      setItens(t.itens.map((it) => rowFromDB(it, t.custos ?? {})));
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
    // Custo da busca = CMPM da empresa ativa (o GET da tabela traz o custo
    // exato da empresa dona ao recarregar). Com markup padrão definido, o
    // preço já nasce calculado a partir do custo.
    const custo = prod.precoCusto != null ? decimalToNumber(prod.precoCusto) : null;
    const mp = parseFloat(form.markupPadrao);
    const usaMarkup = custo != null && custo > 0 && !isNaN(mp);
    setItens((prev) => prev.map((r) => r._key !== key ? r : {
      ...r,
      itemId:       prod.id,
      codigo:       prod.codigo,
      descricao:    prod.descricao,
      unidadeMedida: prod.unidadeMedida,
      custo,
      markupPct:    usaMarkup ? String(mp) : r.markupPct,
      precoBase:    decimalToNumber(prod.precoVenda).toFixed(4),
      precoVenda:   usaMarkup ? precoPorMarkup(custo, mp) : decimalToNumber(prod.precoVenda).toFixed(4),
    }));
    closeSearch();
    setSearchQuery("");
    setDirty(true);
  }

  /** Define o markup de uma linha e recalcula o preço pelo custo. */
  function aplicarMarkupLinha(key: string, markupRaw: string) {
    setItens((prev) => prev.map((r) => {
      if (r._key !== key) return r;
      const mp = parseFloat(markupRaw);
      if (markupRaw === "" || isNaN(mp)) return { ...r, markupPct: "" }; // manual
      if (r.custo == null || r.custo <= 0) return { ...r, markupPct: String(mp) };
      return { ...r, markupPct: String(mp), precoVenda: precoPorMarkup(r.custo, mp) };
    }));
    setDirty(true);
  }

  /** Aplica o markup padrão da tabela a todas as linhas com custo. */
  function aplicarMarkupTodos() {
    const mp = parseFloat(form.markupPadrao);
    if (isNaN(mp)) return;
    setItens((prev) => prev.map((r) =>
      r.custo != null && r.custo > 0
        ? { ...r, markupPct: String(mp), precoVenda: precoPorMarkup(r.custo, mp) }
        : r,
    ));
    setDirty(true);
  }

  /** Reaplica o markup das linhas que têm markup, usando o custo atual. */
  function recalcularPelosCustos() {
    setItens((prev) => prev.map((r) => {
      const mp = parseFloat(r.markupPct);
      if (isNaN(mp) || r.custo == null || r.custo <= 0) return r;
      return { ...r, precoVenda: precoPorMarkup(r.custo, mp) };
    }));
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
        markupPadrao: form.markupPadrao !== "" && !isNaN(parseFloat(form.markupPadrao)) ? parseFloat(form.markupPadrao) : null,
        itens: itens.map((r, idx) => ({
          sequencia:    idx + 1,
          itemId:       r.itemId || null,
          grupo:        r.grupo || null,
          precoBase:    parseFloat(r.precoBase)   || 0,
          precoVenda:   parseFloat(r.precoVenda)  || 0,
          vlrDesconto:  parseFloat(r.vlrDesconto) || 0,
          markupPct:    r.markupPct !== "" && !isNaN(parseFloat(r.markupPct)) ? parseFloat(r.markupPct) : null,
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
      setItens(t.itens.map((it) => rowFromDB(it, t.custos ?? {})));
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
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
  if (!tabela) return <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>;

  return (
    <div>
      <PageHeader
        title={`Tabela de Preço — ${tabela.codigo}`}
        breadcrumbs={[
          { label: "Faturamento" },
          { label: "Tabelas de Preço", href: "/comercial/tabelas-preco" },
          { label: tabela.codigo },
        ]}
        action={
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                {dirty && (
                  <span className="text-xs text-warning bg-warning/10 border border-warning/30 px-2 py-1 rounded-md">
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
          <div className="flex items-center gap-2 bg-success/10 border border-success/30 text-success px-4 py-3 rounded-lg text-sm font-medium">
            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            Alterações salvas com sucesso!
          </div>
        )}
        {saveError && (
          <div className="flex items-center gap-2 bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">
            <XCircle className="w-4 h-4 shrink-0" />
            {saveError}
          </div>
        )}

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between">
            <h2 className="font-semibold text-sm text-foreground">Dados da Tabela</h2>
            <div className="flex items-center gap-4">
              {editing ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox" checked={form.ativa}
                    onChange={(e) => { setForm((f) => ({ ...f, ativa: e.target.checked })); setDirty(true); }}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-sm text-foreground flex items-center gap-1">
                    {form.ativa ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-muted-foreground/60" />}
                    Tab. Ativa
                  </span>
                </label>
              ) : (
                <span className={cn(
                  "flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full",
                  form.ativa ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                )}>
                  {form.ativa ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {form.ativa ? "Ativa" : "Inativa"}
                </span>
              )}
            </div>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Cód. Tabela</Label>
              <Input value={tabela.codigo} readOnly className="bg-muted font-mono font-semibold" />
            </div>
            <div className="col-span-3 space-y-1">
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              {editing ? (
                <Input
                  value={form.descricao}
                  onChange={(e) => { setForm((f) => ({ ...f, descricao: e.target.value })); setDirty(true); }}
                  placeholder="Descrição da tabela"
                />
              ) : (
                <p className="text-sm font-medium text-foreground py-1">{form.descricao || "—"}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data Inicial</Label>
              {editing ? (
                <DatePicker
                  value={form.dataInicial}
                  onChange={(v) => { setForm((f) => ({ ...f, dataInicial: v })); setDirty(true); }}
                />
              ) : (
                <p className="text-sm text-foreground py-1">
                  {form.dataInicial ? new Date(form.dataInicial + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data Final</Label>
              {editing ? (
                <DatePicker
                  value={form.dataFinal}
                  onChange={(v) => { setForm((f) => ({ ...f, dataFinal: v })); setDirty(true); }}
                />
              ) : (
                <p className="text-sm text-foreground py-1">
                  {form.dataFinal ? new Date(form.dataFinal + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                </p>
              )}
            </div>
          </div>
          <Autoria criadoPor={tabela.criadoPor} atualizadoPor={tabela.atualizadoPor} className="px-4 pb-3" />
        </div>

        {/* ── Items grid ─────────────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-sm text-foreground">Itens da Tabela</h2>
            {editing ? (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Markup padrão (%)
                  <input
                    type="text"
                    value={form.markupPadrao}
                    onChange={(e) => { setForm((f) => ({ ...f, markupPadrao: e.target.value.replace(",", ".") })); setDirty(true); }}
                    placeholder="ex: 30"
                    className="h-7 w-20 rounded-md border border-border px-2 text-xs text-right font-mono bg-card focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </label>
                <Button
                  size="sm" variant="outline" onClick={aplicarMarkupTodos}
                  disabled={form.markupPadrao === "" || isNaN(parseFloat(form.markupPadrao))}
                  title="Define o markup padrão em todas as linhas com custo e recalcula os preços"
                >
                  Aplicar a todos
                </Button>
                <Button
                  size="sm" variant="outline" onClick={recalcularPelosCustos}
                  title="Reaplica o markup das linhas que têm markup, usando o custo atual de cada item"
                >
                  Recalcular pelos custos
                </Button>
                <Button size="sm" variant="outline" onClick={addRow}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Item
                </Button>
              </div>
            ) : (
              form.markupPadrao !== "" && (
                <span className="text-xs text-muted-foreground">Markup padrão: <span className="font-semibold text-foreground">{formatPct(form.markupPadrao)}%</span></span>
              )
            )}
          </div>

          {itens.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-3">
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
              <table className="w-full text-sm min-w-[1080px]">
                <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <th className="text-center px-3 py-2.5 font-semibold w-12">#</th>
                    <th className="text-left px-3 py-2.5 font-semibold w-28">Cód. Produto</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Descrição</th>
                    <th className="text-center px-3 py-2.5 font-semibold w-14">U.M.</th>
                    <th className="text-right px-3 py-2.5 font-semibold w-28">Custo (R$)</th>
                    <th className="text-right px-3 py-2.5 font-semibold w-24">Markup %</th>
                    <th className="text-right px-3 py-2.5 font-semibold w-32">Preço Venda</th>
                    <th className="text-right px-3 py-2.5 font-semibold w-32">Vlr. Desconto</th>
                    {editing && <th className="w-10 px-2 py-2.5" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {itens.map((row, idx) => (
                    <tr key={row._key} className="hover:bg-muted/60 group">
                      {/* # */}
                      <td className="px-3 py-2 text-center text-xs font-mono text-muted-foreground">
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
                                ? "border-border bg-card text-foreground hover:border-blue-400"
                                : "border-dashed border-border text-muted-foreground hover:border-blue-400",
                              searchRow === row._key && "border-blue-400 ring-1 ring-blue-200"
                            )}
                          >
                            {row.codigo || <span className="flex items-center gap-1"><Search className="w-3 h-3" />Buscar</span>}
                          </button>
                        ) : (
                          <span className="text-xs font-mono font-semibold text-foreground">{row.codigo || "—"}</span>
                        )}
                      </td>

                      {/* Descrição — sempre read-only */}
                      <td className="px-3 py-2">
                        <span className="text-xs text-foreground">{row.descricao || "—"}</span>
                      </td>

                      {/* U.M. — sempre read-only */}
                      <td className="px-3 py-2 text-center">
                        <span className="text-xs font-semibold font-mono text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded">
                          {row.unidadeMedida || "—"}
                        </span>
                      </td>

                      {/* Custo (CMPM da empresa da tabela) — sempre read-only */}
                      <td className="px-3 py-2 text-right">
                        <span className="text-xs font-mono text-muted-foreground tabular-nums" title="Custo médio (CMPM) atual da empresa da tabela">
                          {row.custo != null && row.custo > 0 ? formatPrice4(row.custo) : "—"}
                        </span>
                      </td>

                      {/* Markup % — calcula o preço a partir do custo */}
                      <td className="px-3 py-2 text-right">
                        {editing ? (
                          <input
                            type="text"
                            defaultValue={row.markupPct === "" ? "" : formatPct(row.markupPct)}
                            key={row._key + "-mk-" + row.markupPct}
                            disabled={row.custo == null || row.custo <= 0}
                            title={row.custo == null || row.custo <= 0 ? "Item sem custo registrado na empresa — preço manual" : "% sobre o custo; vazio = preço manual"}
                            placeholder="manual"
                            onFocus={(e) => { e.target.value = row.markupPct; }}
                            onBlur={(e) => {
                              const raw = e.target.value.trim().replace(",", ".");
                              aplicarMarkupLinha(row._key, raw);
                              e.target.value = raw === "" || isNaN(parseFloat(raw)) ? "" : formatPct(raw);
                            }}
                            className="h-7 w-full rounded-md border border-border px-2 text-xs text-right font-mono bg-card focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 disabled:bg-muted disabled:text-muted-foreground/60"
                          />
                        ) : (
                          <span className="text-xs font-mono text-muted-foreground tabular-nums">
                            {row.markupPct !== "" ? `${formatPct(row.markupPct)}%` : "manual"}
                          </span>
                        )}
                      </td>

                      {/* Preço Venda — digitar direto limpa o markup (vira manual) */}
                      <td className="px-3 py-2 text-right">
                        {editing ? (
                          <input
                            type="text"
                            defaultValue={formatPrice4(row.precoVenda)}
                            key={row._key + "-pv-" + row.precoVenda}
                            onFocus={(e) => { e.target.value = row.precoVenda === "0" ? "" : row.precoVenda; }}
                            onBlur={(e) => {
                              const raw = parsePrice(e.target.value || "0");
                              if (raw !== row.precoVenda) {
                                setItens((prev) => prev.map((r) => r._key === row._key ? { ...r, precoVenda: raw, markupPct: "" } : r));
                                setDirty(true);
                              }
                              e.target.value = formatPrice4(raw);
                            }}
                            className="h-7 w-full rounded-md border border-border px-2 text-xs text-right font-mono bg-card focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                          />
                        ) : (
                          <span className="text-xs font-mono font-medium text-foreground tabular-nums">{formatPrice4(row.precoVenda)}</span>
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
                            className="h-7 w-full rounded-md border border-border px-2 text-xs text-right font-mono bg-card focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                          />
                        ) : (
                          <span className="text-xs font-mono text-muted-foreground tabular-nums">{formatPrice4(row.vlrDesconto)}</span>
                        )}
                      </td>

                      {/* Remove — só em modo edição */}
                      {editing && (
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => removeRow(row._key)}
                            className="p-1 rounded hover:bg-danger/10 text-muted-foreground/60 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border bg-muted">
                  <tr>
                    <td colSpan={editing ? 9 : 8} className="px-4 py-2 text-xs text-muted-foreground">
                      {itens.length} {itens.length === 1 ? "item" : "itens"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── Observações ─────────────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted">
            <h2 className="font-semibold text-sm text-foreground">Observações</h2>
          </div>
          <div className="p-4">
            {editing ? (
              <textarea
                value={form.observacoes}
                onChange={(e) => { setForm((f) => ({ ...f, observacoes: e.target.value })); setDirty(true); }}
                rows={3}
                placeholder="Observações adicionais..."
                className="w-full text-sm border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap min-h-[48px]">
                {form.observacoes || <span className="text-muted-foreground italic">Sem observações</span>}
              </p>
            )}
          </div>
        </div>

        {/* ── Portal: product search dropdown ─────────────────────────────── */}
        {portalMounted && searchRow && searchDropPos && createPortal(
          <div
            data-prod-search
            className="fixed z-[9999] bg-card rounded-xl border border-border shadow-xl overflow-hidden"
            style={{ top: searchDropPos.top, left: searchDropPos.left, width: searchDropPos.width }}
          >
            <div className="relative border-b border-border">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
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
                  <div className="flex items-center justify-center py-4 gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando...
                  </div>
                );
                if (available.length === 0) return (
                  <p className="px-4 py-3 text-xs text-muted-foreground italic text-center">
                    {searchResults.length > 0 ? "Todos os produtos já foram adicionados" : "Nenhum produto encontrado"}
                  </p>
                );
                return available.map((p) => (
                  <button
                    key={p.id}
                    data-prod-search
                    type="button"
                    onMouseDown={() => selectProduct(searchRow, p)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-info/10 text-left border-b border-gray-50 last:border-0"
                  >
                    <span className="font-mono text-xs text-muted-foreground shrink-0 w-20">{p.codigo}</span>
                    <span className="text-sm text-foreground truncate flex-1">{p.descricao}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{p.unidadeMedida}</span>
                    <span className="text-xs font-medium text-info shrink-0">{formatBRL(decimalToNumber(p.precoVenda))}</span>
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
              className="text-xs text-red-400 hover:text-danger transition-colors"
            >
              Excluir tabela
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
