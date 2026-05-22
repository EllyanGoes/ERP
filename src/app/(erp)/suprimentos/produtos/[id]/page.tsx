"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import {
  ChevronRight, Pencil, Save, X, Plus, Trash2,
  Loader2, Package, TrendingUp, TrendingDown, ArrowUpDown,
  BarChart2, ShieldCheck, RefreshCw, Clock, AlertOctagon, AlertTriangle,
  ShoppingBag, ClipboardList, FileText, PackageCheck, ExternalLink, Info,
} from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { TipoProdutoQuickCreate, UnidadeQuickCreate, LocalEstoqueQuickCreate } from "@/components/shared/QuickCreateDialogs";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import { cn, formatBRL, decimalToNumber } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";

// ── Types ──────────────────────────────────────────────────────────────────────
type Movimentacao = {
  id: string;
  tipo: string;
  quantidade: unknown;
  saldoAntes: unknown;
  saldoDepois: unknown;
  documento: string | null;
  observacoes: string | null;
  createdAt: string;
  pedidoVendaItemId: string | null;
  conferenciaItemId: string | null;
  loteId: string | null;
  unidade?: { id: string; sigla: string; nome: string } | null;
};

type Item = {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  unidadeMedida: string;
  unidade: { id: string; sigla: string; nome: string } | null;
  tipoProduto: { id: string; nome: string } | null;
  ncm: string | null;
  precoVenda: unknown;
  precoCusto: unknown;
  ativo: boolean;
  observacoes: string | null;
  estoqueItems: Array<{
    id: string;
    quantidadeAtual: unknown;
    quantidadeMin: unknown;
    quantidadeMax: unknown;
    localizacao: string | null;
    localEstoque: { id: string; nome: string } | null;
  }>;
  fornecedores: Array<{
    id: string;
    codigoFornecedor: string | null;
    precoUltimo: unknown;
    prazoEntregaDias: number | null;
    ativo: boolean;
    fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null };
  }>;
  movimentacoes: Movimentacao[];
};

type Fornecedor    = { id: string; razaoSocial: string; nomeFantasia: string | null; cpfCnpj: string | null };
type UnidadeOpt   = { id: string; sigla: string; nome: string };
type TipoProdOpt  = { id: string; nome: string };

type ComprasData = {
  necessidades: Array<{
    id: string; numero: string; status: string;
    solicitante: string | null; dataNecessidade: string | null; createdAt: string;
    quantidade: unknown; observacao: string | null;
  }>;
  pedidos: Array<{
    id: string; numero: string; status: string;
    valorTotal: unknown; dataEntregaPrevista: string | null; createdAt: string;
    fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null };
    quantidade: unknown; precoUnitario: unknown;
  }>;
  conferencias: Array<{
    id: string; numero: string; status: string;
    dataConferencia: string | null; createdAt: string;
    pedido: { numero: string; fornecedor: { razaoSocial: string; nomeFantasia: string | null } };
    quantidadePedida: unknown; quantidadeRecebida: unknown; divergencia: boolean;
  }>;
};

const TIPO_LABEL: Record<string, string> = {
  PRODUTO: "Produto",
  MATERIA_PRIMA: "Matéria-prima",
  SERVICO: "Serviço",
};

const TIPO_MOV_COLOR: Record<string, string> = {
  ENTRADA: "text-emerald-600 bg-emerald-50",
  SAIDA: "text-red-600 bg-red-50",
  AJUSTE: "text-blue-600 bg-blue-50",
  TRANSFERENCIA: "text-purple-600 bg-purple-50",
};

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function ProdutoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<"dados" | "fornecedores" | "unidades" | "estoques" | "movimentacoes" | "compras" | "relatorio">("dados");
  const [periodoDias, setPeriodoDias] = useState<30 | 90 | 180 | 365>(90);
  const [item, setItem] = useState<Item | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Lookup lists for edit dropdowns
  const [unidades, setUnidades]     = useState<UnidadeOpt[]>([]);
  const [tiposProd, setTiposProd]   = useState<TipoProdOpt[]>([]);

  // Fornecedor add
  const [fornList, setFornList] = useState<Fornecedor[]>([]);
  const [showAddForn, setShowAddForn] = useState(false);
  const [addForn, setAddForn] = useState({ fornecedorId: "", prazoEntregaDias: "" });
  const [addFornError, setAddFornError] = useState("");
  const [addFornSaving, setAddFornSaving] = useState(false);

  // Unidades do produto
  type ItemUnidadeRow = {
    id: string; isPrincipal: boolean; fatorConversao: string | number | null;
    unidade: { id: string; sigla: string; nome: string };
    baseUnidade: { id: string; sigla: string; nome: string } | null;
  };
  const [itemUnidades, setItemUnidades] = useState<ItemUnidadeRow[]>([]);
  const [unidadesLoaded, setUnidadesLoaded] = useState(false);
  const [showAddUnidade, setShowAddUnidade] = useState(false);
  const [addUnidadeId, setAddUnidadeId] = useState("");
  const [addBaseUnidadeId, setAddBaseUnidadeId] = useState("");
  const [addFatorConv, setAddFatorConv] = useState("");
  const [addUnidadeSaving, setAddUnidadeSaving] = useState(false);
  const [addUnidadeError, setAddUnidadeError] = useState("");

  // Movimentação rápida
  const [showMovDialog, setShowMovDialog] = useState(false);
  const [locaisEstoque, setLocaisEstoque] = useState<{ id: string; nome: string }[]>([]);
  const [movForm, setMovForm] = useState({
    tipo: "ENTRADA" as "ENTRADA" | "SAIDA",
    localEstoqueId: "",
    unidadeId: "",
    quantidade: "",
    valorUnitario: "",
    documento: "",
    observacoes: "",
  });
  const [movSaving, setMovSaving] = useState(false);
  const [movError, setMovError] = useState("");

  // Edit movimentação
  const [editMov, setEditMov] = useState<{ id: string; documento: string; observacoes: string; unidadeId: string } | null>(null);
  const [editMovSaving, setEditMovSaving] = useState(false);
  const [editMovError, setEditMovError] = useState("");

  // Delete movimentação
  const [deletingMovId, setDeletingMovId] = useState<string | null>(null);
  const [deleteMovConfirm, setDeleteMovConfirm] = useState<Movimentacao | null>(null);

  // Movimentações — period filter
  const [movPeriodo, setMovPeriodo] = useState<DateRange>({ from: "", to: "" });

  // Compras tab
  const [compras, setCompras]           = useState<ComprasData | null>(null);
  const [comprasLoading, setComprasLoading] = useState(false);
  const [comprasLoaded, setComprasLoaded]   = useState(false);

  function loadCompras() {
    if (comprasLoaded) return;
    setComprasLoading(true);
    fetch(`/api/suprimentos/produtos/${id}/compras`)
      .then((r) => r.json())
      .then((d) => { setCompras(d); setComprasLoaded(true); })
      .finally(() => setComprasLoading(false));
  }

  // Nova Necessidade quick modal
  const [showNecessidade, setShowNecessidade] = useState(false);
  const [necForm, setNecForm] = useState({ quantidade: "", dataNecessidade: "", observacao: "", solicitante: "" });
  const [necSaving, setNecSaving] = useState(false);
  const [necError, setNecError]   = useState("");

  async function submitNecessidade() {
    if (!necForm.quantidade || parseFloat(necForm.quantidade) <= 0) { setNecError("Informe a quantidade"); return; }
    setNecSaving(true); setNecError("");
    try {
      const res = await fetch("/api/suprimentos/necessidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          solicitante: necForm.solicitante || undefined,
          dataNecessidade: necForm.dataNecessidade || undefined,
          itens: [{ itemId: id, quantidade: parseFloat(necForm.quantidade), observacao: necForm.observacao || undefined }],
        }),
      });
      if (!res.ok) { setNecError((await res.json()).error || "Erro ao criar"); return; }
      setShowNecessidade(false);
      setNecForm({ quantidade: "", dataNecessidade: "", observacao: "", solicitante: "" });
      // Refresh compras tab if loaded
      setComprasLoaded(false);
      if (tab === "compras") loadCompras();
    } catch { setNecError("Erro de conexão"); }
    finally { setNecSaving(false); }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suprimentos/produtos/${id}`);
      const json = await res.json();
      const data: Item = json.data;
      setItem(data);
      setForm({
        ...data,
        precoVenda: decimalToNumber(data.precoVenda).toString(),
        precoCusto: data.precoCusto ? decimalToNumber(data.precoCusto).toString() : "",
      });
    } catch { setError("Erro ao carregar produto"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    Promise.all([
      fetch("/api/suprimentos/fornecedores").then((r) => r.json()),
      fetch("/api/suprimentos/unidades").then((r) => r.json()),
      fetch("/api/suprimentos/tipos-produto").then((r) => r.json()),
    ]).then(([forn, un, tp]) => {
      setFornList(Array.isArray(forn) ? forn : (forn.data ?? []));
      setUnidades(Array.isArray(un) ? un : (un.data ?? []));
      setTiposProd(Array.isArray(tp) ? tp : (tp.data ?? []));
    });
  }, []);

  async function saveEdit() {
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/suprimentos/produtos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          precoVenda: parseFloat(form.precoVenda as string) || 0,
          // precoCusto is auto-managed by entrada movements (CMPM) — not sent
        }),
      });
      if (!res.ok) { setError((await res.json()).error || "Erro ao salvar"); return; }
      await load(); setEditMode(false);
    } catch { setError("Erro de conexão"); }
    finally { setSaving(false); }
  }

  async function addFornecedor() {
    if (!addForn.fornecedorId) { setAddFornError("Selecione um fornecedor"); return; }
    setAddFornSaving(true); setAddFornError("");
    try {
      const res = await fetch(`/api/suprimentos/produtos/${id}/fornecedores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornecedorId: addForn.fornecedorId,
          prazoEntregaDias: addForn.prazoEntregaDias ? parseInt(addForn.prazoEntregaDias) : null,
        }),
      });
      if (!res.ok) { setAddFornError((await res.json()).error || "Erro"); return; }
      setShowAddForn(false);
      setAddForn({ fornecedorId: "", prazoEntregaDias: "" });
      await load();
    } catch { setAddFornError("Erro de conexão"); }
    finally { setAddFornSaving(false); }
  }

  async function removeFornecedor(pfId: string) {
    await fetch(`/api/suprimentos/produtos/${id}/fornecedores?produtoFornecedorId=${pfId}`, { method: "DELETE" });
    await load();
  }

  // ── Unidades do produto ───────────────────────────────────────────────────
  function loadItemUnidades() {
    fetch(`/api/suprimentos/produtos/${id}/unidades`).then((r) => r.json()).then((j) => {
      setItemUnidades(Array.isArray(j) ? j : []);
      setUnidadesLoaded(true);
    });
  }

  async function addItemUnidade() {
    if (!addUnidadeId) { setAddUnidadeError("Selecione uma unidade"); return; }
    setAddUnidadeSaving(true); setAddUnidadeError("");
    try {
      const res = await fetch(`/api/suprimentos/produtos/${id}/unidades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unidadeId:     addUnidadeId,
          baseUnidadeId: addBaseUnidadeId || null,
          fatorConversao: addFatorConv ? parseFloat(addFatorConv) : null,
          isPrincipal: itemUnidades.length === 0,
        }),
      });
      if (!res.ok) { setAddUnidadeError((await res.json()).error || "Erro"); return; }
      setShowAddUnidade(false);
      setAddUnidadeId(""); setAddBaseUnidadeId(""); setAddFatorConv("");
      loadItemUnidades();
    } catch { setAddUnidadeError("Erro de conexão"); }
    finally { setAddUnidadeSaving(false); }
  }

  async function removeItemUnidade(itemUnidadeId: string) {
    await fetch(`/api/suprimentos/produtos/${id}/unidades/${itemUnidadeId}`, { method: "DELETE" });
    loadItemUnidades();
  }

  async function setPrincipal(itemUnidadeId: string, unidadeId: string) {
    await fetch(`/api/suprimentos/produtos/${id}/unidades`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unidadeId, isPrincipal: true }),
    });
    loadItemUnidades();
  }

  function openMovDialog() {
    // Pre-select the principal unit (may already be loaded)
    const principal = itemUnidades.find((iu) => iu.isPrincipal);
    const defaultUnidadeId = principal?.unidade.id ?? item?.unidade?.id ?? "";
    setMovForm({ tipo: "ENTRADA", localEstoqueId: "", unidadeId: defaultUnidadeId, quantidade: "", valorUnitario: "", documento: "", observacoes: "" });
    setMovError("");
    setShowMovDialog(true);
    if (locaisEstoque.length === 0) {
      fetch("/api/suprimentos/locais-estoque").then((r) => r.json()).then((j) => {
        setLocaisEstoque(Array.isArray(j) ? j : (j.data ?? []));
      });
    }
    if (!unidadesLoaded) loadItemUnidades();
  }

  async function submitMov() {
    if (!movForm.localEstoqueId) { setMovError("Selecione o local de estoque"); return; }
    if (!movForm.quantidade || parseFloat(movForm.quantidade) <= 0) { setMovError("Informe a quantidade"); return; }
    setMovSaving(true); setMovError("");

    // Convert quantity to the primary unit if a secondary unit is selected
    const selectedIU = itemUnidades.find((iu) => iu.unidade.id === movForm.unidadeId);
    const fator = selectedIU && !selectedIU.isPrincipal && selectedIU.fatorConversao
      ? Number(selectedIU.fatorConversao)
      : 1;
    const qtdConvertida = parseFloat(movForm.quantidade) * fator;

    // The unit stored in the movement is always the primary unit
    const principalIU = itemUnidades.find((iu) => iu.isPrincipal);
    const unidadeIdFinal = (principalIU?.unidade.id ?? movForm.unidadeId) || undefined;

    try {
      const res = await fetch("/api/suprimentos/movimentacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: movForm.tipo,
          documento: movForm.documento || undefined,
          observacoes: movForm.observacoes
            ? movForm.observacoes
            : fator !== 1
              ? `Convertido de ${parseFloat(movForm.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${selectedIU?.unidade.sigla ?? ""}`
              : undefined,
          itens: [{
            itemId: id,
            localEstoqueId: movForm.localEstoqueId,
            unidadeId: unidadeIdFinal,
            quantidade: qtdConvertida,
            valorUnitario: movForm.tipo === "ENTRADA" && movForm.valorUnitario
              ? parseFloat(movForm.valorUnitario) / fator  // unit cost is per primary unit
              : undefined,
          }],
        }),
      });
      if (!res.ok) { setMovError((await res.json()).error || "Erro ao registrar"); return; }
      setShowMovDialog(false);
      await load();
    } catch { setMovError("Erro de conexão"); }
    finally { setMovSaving(false); }
  }

  // ── Edit movimentação ─────────────────────────────────────────────────────
  async function submitEditMov() {
    if (!editMov) return;
    setEditMovSaving(true); setEditMovError("");
    try {
      const res = await fetch(`/api/suprimentos/movimentacoes/${editMov.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documento:   editMov.documento   || null,
          observacoes: editMov.observacoes || null,
          unidadeId:   editMov.unidadeId   || null,
        }),
      });
      if (!res.ok) { setEditMovError((await res.json()).error || "Erro ao salvar"); return; }
      setEditMov(null);
      await load();
    } catch { setEditMovError("Erro de conexão"); }
    finally { setEditMovSaving(false); }
  }

  // ── Delete movimentação ───────────────────────────────────────────────────
  async function confirmDeleteMov(movId: string) {
    setDeletingMovId(movId);
    try {
      const res = await fetch(`/api/suprimentos/movimentacoes/${movId}`, { method: "DELETE" });
      if (!res.ok) { alert((await res.json()).error || "Erro ao excluir"); return; }
      setDeleteMovConfirm(null);
      await load();
    } catch { alert("Erro de conexão"); }
    finally { setDeletingMovId(null); }
  }

  // Set tab title once item is loaded
  useTabTitle(item?.descricao ?? null);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );
  if (!item) return <div className="px-8 pt-8 text-red-500">{error || "Produto não encontrado"}</div>;

  // ── Calculated stock values ───────────────────────────────────────────────
  const estoqueComLocal = item.estoqueItems.filter((e) => e.localEstoque !== null);
  const estoqueTotal = estoqueComLocal.reduce((s, e) => s + decimalToNumber(e.quantidadeAtual), 0);
  const custoUnit = item.precoCusto ? decimalToNumber(item.precoCusto) : 0;
  const custoTotal = custoUnit * estoqueTotal;
  // Custo médio: média ponderada das últimas entradas
  const entradas = item.movimentacoes.filter((m) => m.tipo === "ENTRADA");
  const custoMedio = entradas.length > 0 && item.fornecedores.length > 0
    ? item.fornecedores.reduce((s, f) => s + decimalToNumber(f.precoUltimo), 0) / item.fornecedores.filter((f) => decimalToNumber(f.precoUltimo) > 0).length
    : custoUnit;

  const totalCompras = compras
    ? compras.necessidades.length + compras.pedidos.length + compras.conferencias.length
    : null;

  const TABS = [
    { key: "dados",          label: "Dados" },
    { key: "fornecedores",   label: `Fornecedores (${item.fornecedores?.length ?? 0})` },
    { key: "unidades",       label: `Unidades (${unidadesLoaded ? itemUnidades.length : "…"})` },
    { key: "estoques",       label: "Estoques" },
    { key: "movimentacoes",  label: `Movimentações (${item.movimentacoes?.length ?? 0})` },
    { key: "compras",        label: totalCompras !== null ? `Compras (${totalCompras})` : "Compras" },
    { key: "relatorio",      label: "Relatório" },
  ] as const;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Breadcrumb */}
      <div className="px-8 pt-6 flex items-center gap-1.5 text-sm text-gray-500">
        <span>Suprimentos</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link href="/suprimentos/produtos" className="hover:text-gray-800 transition-colors">Produtos</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-700 font-medium">{item.codigo}</span>
      </div>

      {/* Header */}
      <div className="px-8 pt-2 pb-0 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">{item.descricao}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-xs text-gray-400">{item.codigo}</span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-500">{TIPO_LABEL[item.tipo] ?? item.tipo}</span>
              <span className="text-gray-300">·</span>
              <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium",
                item.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              )}>
                {item.ativo ? "Ativo" : "Inativo"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-1">
          {editMode ? (
            <>
              <Button size="sm" onClick={saveEdit} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Salvar
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditMode(false); setError(""); }}>
                <X className="w-4 h-4 mr-1" />Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setShowNecessidade(true); setNecForm({ quantidade: "", dataNecessidade: "", observacao: "", solicitante: "" }); setNecError(""); }}
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                <ClipboardList className="w-4 h-4 mr-1" />
                Nova Necessidade
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>
                <Pencil className="w-4 h-4 mr-1" />Editar
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-8 mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>
      )}

      {/* Tabs */}
      <div className="px-8 mt-5 border-b border-gray-200">
        <div className="flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); if (t.key === "unidades" && !unidadesLoaded) loadItemUnidades(); if (t.key === "compras") loadCompras(); }}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                tab === t.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-8 py-6">

        {/* ── DADOS ──────────────────────────────────────────────────────── */}
        {tab === "dados" && (
          <div className="space-y-6 max-w-4xl">
            {/* Identificação */}
            <Section title="Identificação">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                {editMode ? (
                  <>
                    <Field label="Código">
                      <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-gray-200 bg-gray-50 cursor-not-allowed">
                        <span className="font-mono text-sm text-gray-700">{item.codigo}</span>
                        <span className="ml-auto text-[10px] font-semibold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">auto</span>
                      </div>
                    </Field>
                    <Field label="Tipo de Produto">
                      <ComboboxWithCreate
                        options={tiposProd.map((tp) => ({ value: tp.id, label: tp.nome }))}
                        value={(form.tipoProdutoId as string) || ""}
                        onChange={(v) => setForm((p) => ({ ...p, tipoProdutoId: v || null }))}
                        noneLabel="Nenhum"
                        placeholder="Selecionar tipo..."
                        createHref="/suprimentos/tipos-produto"
                        createParam="nome"
                        createLabel="tipo de produto"
                        renderCreateModal={(args) => <TipoProdutoQuickCreate {...args} />}
                      />
                    </Field>
                    <Field label="Descrição" colSpan>
                      <Input value={(form.descricao as string) ?? ""} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} />
                    </Field>
                    <Field label="Unidade Principal">
                      <ComboboxWithCreate
                        options={unidades.map((u) => ({ value: u.id, label: `${u.sigla} — ${u.nome}` }))}
                        value={(form.unidadeId as string) || ""}
                        onChange={(v) => setForm((p) => ({ ...p, unidadeId: v || null }))}
                        noneLabel="Padrão (UN)"
                        placeholder="Selecionar unidade..."
                        createHref="/suprimentos/unidades"
                        createParam="nome"
                        createLabel="unidade de medida"
                        renderCreateModal={(args) => <UnidadeQuickCreate {...args} />}
                      />
                      <p className="text-[11px] text-gray-400 mt-1">Usada para gestão do estoque · configure conversões na aba Unidades</p>
                    </Field>
                    <Field label="NCM">
                      <Input value={(form.ncm as string) ?? ""} onChange={(e) => setForm((p) => ({ ...p, ncm: e.target.value }))} placeholder="Ex: 8471.60.52" />
                    </Field>
                    <Field label="Status">
                      <Select value={(form.ativo as boolean) ? "true" : "false"} onValueChange={(v) => setForm((p) => ({ ...p, ativo: v === "true" }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Ativo</SelectItem>
                          <SelectItem value="false">Inativo</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                ) : (
                  <>
                    <Info label="Código" value={item.codigo} mono />
                    <Info label="Tipo de Produto" value={item.tipoProduto?.nome} />
                    <Info label="Descrição" value={item.descricao} colSpan />
                    <Info label="Unidade Principal" value={item.unidade ? `${item.unidade.sigla} — ${item.unidade.nome}` : item.unidadeMedida} />
                    <Info label="NCM" value={item.ncm} />
                    {item.observacoes && <Info label="Observações" value={item.observacoes} colSpan />}
                  </>
                )}
              </div>
            </Section>

            {/* Preços */}
            <Section title="Preços">
              {editMode ? (
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  {/* Custo Médio — read-only, maintained by entries */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-500">Custo Médio</p>
                    <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-gray-200 bg-gray-50 cursor-not-allowed">
                      <span className="text-sm text-gray-700">
                        {custoUnit > 0 ? formatBRL(custoUnit) : "—"}
                      </span>
                      <span className="ml-auto text-[10px] text-gray-400 whitespace-nowrap">auto · entradas</span>
                    </div>
                    <p className="text-[10px] text-gray-400 leading-tight">
                      Calculado automaticamente via CMPM. Informe o custo ao registrar entradas.
                    </p>
                  </div>
                  <Field label="Preço de Venda (R$)">
                    <Input
                      type="number" step="0.01"
                      value={(form.precoVenda as string) ?? ""}
                      onChange={(e) => setForm((p) => ({ ...p, precoVenda: e.target.value }))}
                      placeholder="0,00"
                    />
                  </Field>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {/* Custo Médio */}
                  <div className="rounded-xl bg-gray-50 px-4 py-3">
                    <p className="text-xs text-gray-500 font-medium mb-1">Custo Médio</p>
                    <p className="text-xl font-bold text-gray-800">
                      {custoUnit > 0 ? formatBRL(custoUnit) : "—"}
                    </p>
                    {custoUnit > 0 && <p className="text-xs text-gray-400 mt-0.5">CMPM por entradas</p>}
                  </div>
                  {/* Custo Total */}
                  <div className="rounded-xl bg-blue-50 px-4 py-3">
                    <p className="text-xs text-blue-600 font-medium mb-1">Custo Total em Estoque</p>
                    <p className="text-xl font-bold text-blue-800">
                      {custoUnit > 0 ? formatBRL(custoTotal) : "—"}
                    </p>
                    {custoUnit > 0 && (
                      <p className="text-xs text-blue-500 mt-0.5">
                        {estoqueTotal.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.unidade?.sigla || item.unidadeMedida}
                      </p>
                    )}
                  </div>
                  {/* Custo Médio */}
                  <div className="rounded-xl bg-violet-50 px-4 py-3">
                    <p className="text-xs text-violet-600 font-medium mb-1">Custo Médio</p>
                    <p className="text-xl font-bold text-violet-800">
                      {custoMedio > 0 ? formatBRL(custoMedio) : "—"}
                    </p>
                    {item.fornecedores.filter((f) => decimalToNumber(f.precoUltimo) > 0).length > 0 && (
                      <p className="text-xs text-violet-400 mt-0.5">média dos fornecedores</p>
                    )}
                  </div>
                  {/* Preço de Venda */}
                  <div className="rounded-xl bg-emerald-50 px-4 py-3">
                    <p className="text-xs text-emerald-600 font-medium mb-1">Preço de Venda</p>
                    <p className="text-xl font-bold text-emerald-800">
                      {formatBRL(decimalToNumber(item.precoVenda))}
                    </p>
                    {custoUnit > 0 && decimalToNumber(item.precoVenda) > 0 && (
                      <p className="text-xs text-emerald-500 mt-0.5">
                        margem {(((decimalToNumber(item.precoVenda) - custoUnit) / decimalToNumber(item.precoVenda)) * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                </div>
              )}
            </Section>

            {/* Observações (edit only shown inline) */}
            {editMode && (
              <Section title="Observações">
                <Input
                  value={(form.observacoes as string) ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
                  placeholder="Observações opcionais"
                />
              </Section>
            )}
          </div>
        )}

        {/* ── FORNECEDORES ────────────────────────────────────────────────── */}
        {tab === "fornecedores" && (
          <div className="space-y-4 max-w-4xl">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setAddFornError(""); setAddForn({ fornecedorId: "", prazoEntregaDias: "" }); setShowAddForn(true); }}>
                <Plus className="w-4 h-4 mr-1" />Adicionar Fornecedor
              </Button>
            </div>

            {/* ── Fornecedor dialog ──────────────────────────────────────────── */}
            {showAddForn && typeof window !== "undefined" && createPortal(
              <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
                <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 text-base">Vincular Fornecedor</h3>
                    <button type="button" onClick={() => setShowAddForn(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-4">
                    {addFornError && (
                      <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{addFornError}</p>
                    )}
                    <div className="space-y-1.5">
                      <Label>Fornecedor <span className="text-red-500">*</span></Label>
                      <ComboboxWithCreate
                        options={fornList.map((f) => ({ value: f.id, label: (f.nomeFantasia || f.razaoSocial) + (f.cpfCnpj ? ` (${f.cpfCnpj})` : "") }))}
                        value={addForn.fornecedorId}
                        onChange={(v) => setAddForn((p) => ({ ...p, fornecedorId: v }))}
                        allowNone={false}
                        placeholder="Selecionar fornecedor..."
                        createHref="/suprimentos/fornecedores/novo"
                        createParam="nome"
                        createLabel="fornecedor"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Prazo de Entrega (dias)</Label>
                      <Input type="number" value={addForn.prazoEntregaDias} onChange={(e) => setAddForn((p) => ({ ...p, prazoEntregaDias: e.target.value }))} placeholder="Ex: 7" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <Button size="sm" variant="outline" onClick={() => setShowAddForn(false)} disabled={addFornSaving}>Cancelar</Button>
                    <Button size="sm" onClick={addFornecedor} disabled={addFornSaving}>
                      {addFornSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                      Salvar
                    </Button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {!item.fornecedores?.length ? (
              <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
                <p className="text-sm">Nenhum fornecedor vinculado a este produto</p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600 uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold">Fornecedor</th>
                      <th className="text-left px-4 py-3 font-semibold">Cód. Fornecedor</th>
                      <th className="text-right px-4 py-3 font-semibold">Último Preço</th>
                      <th className="text-right px-4 py-3 font-semibold">Prazo (dias)</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {item.fornecedores.map((pf) => (
                      <tr key={pf.id} className="hover:bg-blue-50/40">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <Link href={`/suprimentos/fornecedores/${pf.fornecedor.id}`} className="hover:text-blue-600 hover:underline">
                            {pf.fornecedor.nomeFantasia || pf.fornecedor.razaoSocial}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">{pf.codigoFornecedor || "—"}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-800">{pf.precoUltimo ? formatBRL(decimalToNumber(pf.precoUltimo)) : <span className="text-gray-400">—</span>}</td>
                        <td className="px-4 py-3 text-right text-gray-700 font-semibold">{pf.prazoEntregaDias ?? <span className="text-gray-400">—</span>}</td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-300 hover:text-red-500" onClick={() => removeFornecedor(pf.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── UNIDADES ────────────────────────────────────────────────────── */}
        {tab === "unidades" && (
          <div className="space-y-4 max-w-4xl">
            {/* Primary unit banner */}
            <div className="flex items-center justify-between gap-4 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Unidade Principal (Estoque)</p>
                  {item.unidade ? (
                    <p className="text-sm font-bold text-blue-900 mt-0.5">
                      <span className="font-mono">{item.unidade.sigla}</span>
                      <span className="font-normal text-blue-600 ml-1.5">— {item.unidade.nome}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-blue-500 italic">Não definida — configure na aba Dados</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setTab("dados")}
                className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2 shrink-0 transition-colors"
              >
                Editar em Dados ↗
              </button>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Unidades alternativas aceitas em movimentações.
                Marque uma como <strong>principal</strong> para sincronizar com a aba Dados.
              </p>
              <Button size="sm" onClick={() => { setAddUnidadeError(""); setAddUnidadeId(""); setAddBaseUnidadeId(""); setAddFatorConv(""); setShowAddUnidade(true); }}>
                <Plus className="w-4 h-4 mr-1" />Adicionar Unidade
              </Button>
            </div>

            {/* Add unit dialog */}
            {showAddUnidade && typeof window !== "undefined" && createPortal(
              <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
                <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 text-base">Adicionar Unidade</h3>
                    <button type="button" onClick={() => setShowAddUnidade(false)} className="text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-4">
                    {addUnidadeError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{addUnidadeError}</p>}

                    {/* Unit selector */}
                    <div className="space-y-1.5">
                      <Label>Unidade <span className="text-red-500">*</span></Label>
                      <ComboboxWithCreate
                        options={unidades
                          .filter((u) => !itemUnidades.some((iu) => iu.unidade.id === u.id))
                          .map((u) => ({ value: u.id, label: `${u.sigla} — ${u.nome}` }))}
                        value={addUnidadeId}
                        onChange={setAddUnidadeId}
                        allowNone={false}
                        placeholder="Selecionar unidade..."
                        createHref="/suprimentos/unidades"
                        createParam="nome"
                        createLabel="unidade"
                        renderCreateModal={(args) => <UnidadeQuickCreate {...args} />}
                      />
                    </div>

                    {/* Conversion factor — inline "1 [A] = [N] [B]" */}
                    <div className="space-y-1.5">
                      <Label>
                        Fator de Conversão{" "}
                        <span className="text-gray-400 font-normal text-xs">(opcional)</span>
                      </Label>
                      <div className="flex items-center gap-2">
                        {/* Left side: "1 [from unit]" */}
                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700 whitespace-nowrap shrink-0">
                          <span className="text-gray-400">1</span>
                          <span className="font-semibold font-mono">
                            {addUnidadeId
                              ? (unidades.find((u) => u.id === addUnidadeId)?.sigla ?? "?")
                              : "—"}
                          </span>
                        </div>
                        <span className="text-gray-400 text-sm shrink-0">=</span>
                        {/* Factor input */}
                        <Input
                          type="number" step="0.000001" min="0"
                          value={addFatorConv}
                          onChange={(e) => setAddFatorConv(e.target.value)}
                          placeholder="Fator"
                          className="w-28 shrink-0"
                        />
                        {/* Right side: base unit selector */}
                        <div className="flex-1 min-w-0">
                          <ComboboxWithCreate
                            options={unidades.map((u) => ({ value: u.id, label: `${u.sigla} — ${u.nome}` }))}
                            value={addBaseUnidadeId}
                            onChange={setAddBaseUnidadeId}
                            allowNone
                            noneLabel="Unidade base"
                            placeholder="Unidade base..."
                            createHref="/suprimentos/unidades"
                            createParam="nome"
                            createLabel="unidade"
                            renderCreateModal={(args) => <UnidadeQuickCreate {...args} />}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-gray-400">
                        Ex: 1 TON = 1000 KG
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <Button size="sm" variant="outline" onClick={() => setShowAddUnidade(false)} disabled={addUnidadeSaving}>Cancelar</Button>
                    <Button size="sm" onClick={addItemUnidade} disabled={addUnidadeSaving || !addUnidadeId}>
                      {addUnidadeSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                      Adicionar
                    </Button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {/* Units list */}
            {!unidadesLoaded ? (
              <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
            ) : itemUnidades.length === 0 ? (
              <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
                <p className="text-sm font-medium">Nenhuma unidade cadastrada</p>
                <p className="text-xs mt-1">Clique em "Adicionar Unidade" para configurar</p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">Unidade</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">Sigla</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">Fator Conv.</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">Status</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {itemUnidades.map((iu) => {
                      const isProductPrincipal = item.unidade?.id === iu.unidade.id;
                      return (
                        <tr key={iu.id} className={cn("hover:bg-blue-50/40", isProductPrincipal && "bg-blue-50/40")}>
                          <td className="px-4 py-3 font-medium text-gray-900">{iu.unidade.nome}</td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              "font-mono text-xs px-2 py-0.5 rounded",
                              isProductPrincipal ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-700"
                            )}>{iu.unidade.sigla}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {iu.fatorConversao ? (
                              <span className="font-mono bg-gray-50 border border-gray-200 rounded px-2 py-0.5 text-gray-700">
                                1 {iu.unidade.sigla} = {Number(iu.fatorConversao).toLocaleString("pt-BR", { maximumFractionDigits: 6 })}{iu.baseUnidade ? ` ${iu.baseUnidade.sigla}` : ""}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isProductPrincipal ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                <ShieldCheck className="w-3 h-3" /> Principal (Estoque)
                              </span>
                            ) : iu.isPrincipal ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                ★ Padrão mov.
                              </span>
                            ) : (
                              <button
                                onClick={() => setPrincipal(iu.id, iu.unidade.id)}
                                className="text-xs text-gray-400 hover:text-blue-600 underline underline-offset-2 transition-colors"
                              >
                                Tornar principal
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!isProductPrincipal && (
                              <button
                                onClick={() => removeItemUnidade(iu.id)}
                                className="text-gray-300 hover:text-red-500 transition-colors"
                                title="Remover"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ESTOQUES ────────────────────────────────────────────────────── */}
        {tab === "estoques" && (
          <div className="space-y-4 max-w-4xl">
            {item.tipo === "SERVICO" ? (
              <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
                <p className="text-sm">Serviços não possuem controle de estoque</p>
              </div>
            ) : estoqueComLocal.length === 0 ? (
              <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
                <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum estoque registrado em local definido</p>
                <p className="text-xs mt-1">Registre uma movimentação de entrada para inicializar o saldo</p>
              </div>
            ) : (
              <>
                {estoqueComLocal.length > 1 && (
                  <div className="bg-blue-50 rounded-xl px-5 py-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-700">Total em todos os locais</span>
                    <span className="text-2xl font-bold text-blue-800">
                      {estoqueTotal.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                      <span className="text-sm font-normal ml-1">{item.unidade?.sigla || item.unidadeMedida}</span>
                    </span>
                  </div>
                )}
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600 uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold">Local de Estoque</th>
                        <th className="text-left px-4 py-3 font-semibold">Localização</th>
                        <th className="text-right px-4 py-3 font-semibold">Qtd. Atual</th>
                        <th className="text-right px-4 py-3 font-semibold">Mínimo</th>
                        <th className="text-right px-4 py-3 font-semibold">Máximo</th>
                        <th className="text-center px-4 py-3 font-semibold">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {estoqueComLocal.map((e) => {
                        const atual = decimalToNumber(e.quantidadeAtual);
                        const min = decimalToNumber(e.quantidadeMin);
                        const max = e.quantidadeMax ? decimalToNumber(e.quantidadeMax) : null;
                        const abaixo = min > 0 && atual < min;
                        const acima = max !== null && atual > max;
                        return (
                          <tr key={e.id} className={cn("hover:bg-blue-50/40", abaixo && "bg-red-50/40")}>
                            <td className="px-4 py-3 font-medium text-gray-800">
                              <Link href={`/suprimentos/locais-estoque/${e.localEstoque!.id}`} className="hover:text-blue-600 hover:underline">
                                {e.localEstoque!.nome}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">
                              {e.localizacao ? (
                                <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{e.localizacao}</span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={cn("font-bold text-base", abaixo ? "text-red-600" : "text-gray-900")}>
                                {atual.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                              </span>
                              <span className="text-xs text-gray-600 font-semibold ml-1">{item.unidade?.sigla || item.unidadeMedida}</span>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700 font-semibold">{min > 0 ? min.toLocaleString("pt-BR") : <span className="text-gray-400">—</span>}</td>
                            <td className="px-4 py-3 text-right text-gray-700 font-semibold">{max !== null ? max.toLocaleString("pt-BR") : <span className="text-gray-400">—</span>}</td>
                            <td className="px-4 py-3 text-center">
                              {abaixo ? (
                                <span className="text-xs font-semibold text-red-700 bg-red-100 border border-red-200 px-2.5 py-1 rounded-full">Baixo</span>
                              ) : acima ? (
                                <span className="text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full">Acima máx.</span>
                              ) : (
                                <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-full">Normal</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {estoqueComLocal.length > 1 && (
                      <tfoot>
                        <tr className="border-t border-gray-200 bg-gray-50">
                          <td colSpan={2} className="px-4 py-2 text-xs font-medium text-gray-500">Total</td>
                          <td className="px-4 py-2 text-right font-bold text-gray-900">
                            {estoqueTotal.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                            <span className="text-xs font-normal text-gray-400 ml-1">{item.unidade?.sigla || item.unidadeMedida}</span>
                          </td>
                          <td colSpan={3} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── MOVIMENTAÇÕES ───────────────────────────────────────────────── */}
        {tab === "movimentacoes" && (() => {
          // ── Period filter ──────────────────────────────────────────────
          const inicio = movPeriodo.from ? new Date(movPeriodo.from + "T00:00:00") : null;
          const fim    = movPeriodo.to   ? new Date(movPeriodo.to   + "T23:59:59") : null;
          const movsVisiveis = item.movimentacoes.filter((m) => {
            const d = new Date(m.createdAt);
            if (inicio && d < inicio) return false;
            if (fim    && d > fim)    return false;
            return true;
          });
          const temFiltro = !!movPeriodo.from || !!movPeriodo.to;

          return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Histórico de movimentações deste produto</p>
              <Button size="sm" onClick={openMovDialog}>
                <ArrowUpDown className="w-4 h-4 mr-1.5" />
                Nova Movimentação
              </Button>
            </div>

            {/* Period filter bar */}
            <div className="flex items-center gap-3">
              <DateRangePicker
                value={movPeriodo}
                onChange={setMovPeriodo}
                placeholder="Filtrar por período..."
              />
              {temFiltro && (
                <span className="text-xs text-gray-400">
                  {movsVisiveis.length} de {item.movimentacoes.length} movimentaç{movsVisiveis.length !== 1 ? "ões" : "ão"}
                </span>
              )}
            </div>

            {/* Summary */}
            {movsVisiveis.length > 0 && (() => {
              const entradas = movsVisiveis.filter((m) => m.tipo === "ENTRADA");
              const saidas = movsVisiveis.filter((m) => m.tipo === "SAIDA");
              const totalEntrada = entradas.reduce((s, m) => s + decimalToNumber(m.quantidade), 0);
              const totalSaida = saidas.reduce((s, m) => s + decimalToNumber(m.quantidade), 0);
              return (
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl bg-emerald-50 px-4 py-3 flex items-center gap-3">
                    <TrendingUp className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-xs text-emerald-600 font-medium">Total Entradas</p>
                      <p className="text-xl font-bold text-emerald-800">
                        {totalEntrada.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-red-50 px-4 py-3 flex items-center gap-3">
                    <TrendingDown className="w-5 h-5 text-red-500 shrink-0" />
                    <div>
                      <p className="text-xs text-red-600 font-medium">Total Saídas</p>
                      <p className="text-xl font-bold text-red-800">
                        {totalSaida.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-blue-50 px-4 py-3 flex items-center gap-3">
                    <ArrowUpDown className="w-5 h-5 text-blue-500 shrink-0" />
                    <div>
                      <p className="text-xs text-blue-600 font-medium">Movimentações</p>
                      <p className="text-xl font-bold text-blue-800">{movsVisiveis.length}</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {movsVisiveis.length === 0 ? (
              <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
                <ArrowUpDown className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">
                  {temFiltro ? "Nenhuma movimentação no período selecionado" : "Nenhuma movimentação registrada"}
                </p>
                <p className="text-sm mt-1">
                  {temFiltro ? "Tente ajustar as datas do filtro." : "As movimentações são geradas automaticamente."}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600 uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold">Data</th>
                      <th className="text-center px-4 py-3 font-semibold">Tipo</th>
                      <th className="text-right px-4 py-3 font-semibold">Quantidade</th>
                      <th className="text-left px-4 py-3 font-semibold">Unidade</th>
                      <th className="text-right px-4 py-3 font-semibold">Saldo Antes</th>
                      <th className="text-right px-4 py-3 font-semibold">Saldo Depois</th>
                      <th className="text-left px-4 py-3 font-semibold">Origem</th>
                      <th className="text-left px-4 py-3 font-semibold">Documento</th>
                      <th className="text-left px-4 py-3 font-semibold">Obs.</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {movsVisiveis.map((m) => (
                      <tr key={m.id} className="hover:bg-blue-50/40 group/row">
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                          {formatDateTime(m.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                            TIPO_MOV_COLOR[m.tipo] ?? "text-gray-600 bg-gray-100"
                          )}>
                            {m.tipo === "ENTRADA" && <TrendingUp className="w-3 h-3 mr-1" />}
                            {m.tipo === "SAIDA" && <TrendingDown className="w-3 h-3 mr-1" />}
                            {m.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          <span className={m.tipo === "SAIDA" ? "text-red-600" : "text-emerald-600"}>
                            {m.tipo === "SAIDA" ? "−" : "+"}{decimalToNumber(m.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {m.unidade
                            ? <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{m.unidade.sigla}</span>
                            : <span className="font-mono text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{item.unidade?.sigla || item.unidadeMedida}</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {decimalToNumber(m.saldoAntes).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-800">
                          {decimalToNumber(m.saldoDepois).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-4 py-3">
                          {(m.pedidoVendaItemId || m.conferenciaItemId) ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                              <RefreshCw className="w-3 h-3" />Automática
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              Manual
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                          {m.documento || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[140px] truncate">
                          {m.observacoes || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end opacity-0 group-hover/row:opacity-100 transition-opacity">
                            <button
                              onClick={() => setEditMov({
                                id: m.id,
                                documento:   m.documento   ?? "",
                                observacoes: m.observacoes ?? "",
                                unidadeId:   m.unidade?.id ?? "",
                              })}
                              className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteMovConfirm(m)}
                              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          );
        })()}
        {/* ── COMPRAS ─────────────────────────────────────────────────── */}
        {tab === "compras" && (
          <div className="space-y-6">
            {comprasLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
            ) : !compras ? null : (
              <>
                {/* ── Necessidades ── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-amber-500" />
                      Necessidades de Compra
                      <span className="text-xs font-normal text-gray-400">({compras.necessidades.length})</span>
                    </h3>
                    <Button size="sm" variant="outline"
                      className="border-amber-300 text-amber-700 hover:bg-amber-50"
                      onClick={() => { setShowNecessidade(true); setNecForm({ quantidade: "", dataNecessidade: "", observacao: "", solicitante: "" }); setNecError(""); }}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Nova Necessidade
                    </Button>
                  </div>
                  {compras.necessidades.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 border border-dashed border-gray-200 rounded-xl text-sm">
                      Nenhuma necessidade de compra registrada para este produto
                    </div>
                  ) : (
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600 uppercase tracking-wide">
                          <tr>
                            <th className="text-left px-4 py-2.5 font-semibold">Número</th>
                            <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                            <th className="text-right px-4 py-2.5 font-semibold">Qtd.</th>
                            <th className="text-left px-4 py-2.5 font-semibold">Solicitante</th>
                            <th className="text-left px-4 py-2.5 font-semibold">Prazo</th>
                            <th className="text-left px-4 py-2.5 font-semibold">Criado em</th>
                            <th className="w-10" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {compras.necessidades.map((n) => (
                            <tr key={n.id} className="hover:bg-blue-50/40">
                              <td className="px-4 py-3 font-mono text-xs font-bold text-blue-700">{n.numero}</td>
                              <td className="px-4 py-3">
                                <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold", {
                                  "bg-gray-100 text-gray-600":   n.status === "RASCUNHO",
                                  "bg-amber-100 text-amber-700": n.status === "PENDENTE",
                                  "bg-blue-100 text-blue-700":   n.status === "APROVADO",
                                  "bg-green-100 text-green-700": n.status === "CONCLUIDO",
                                  "bg-red-100 text-red-700":     n.status === "REPROVADO" || n.status === "CANCELADO",
                                })}>
                                  {n.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-gray-800">
                                {decimalToNumber(n.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                              </td>
                              <td className="px-4 py-3 text-gray-700 text-xs">{n.solicitante || <span className="text-gray-400">—</span>}</td>
                              <td className="px-4 py-3 text-gray-600 text-xs">
                                {n.dataNecessidade ? new Date(n.dataNecessidade).toLocaleDateString("pt-BR") : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                                {new Date(n.createdAt).toLocaleDateString("pt-BR")}
                              </td>
                              <td className="px-3 py-3">
                                <Link href={`/compras/necessidades/${n.id}`} className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 inline-flex">
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* ── Pedidos de Compra ── */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-500" />
                    Pedidos de Compra
                    <span className="text-xs font-normal text-gray-400">({compras.pedidos.length})</span>
                  </h3>
                  {compras.pedidos.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 border border-dashed border-gray-200 rounded-xl text-sm">
                      Nenhum pedido de compra para este produto
                    </div>
                  ) : (
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600 uppercase tracking-wide">
                          <tr>
                            <th className="text-left px-4 py-2.5 font-semibold">Número</th>
                            <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                            <th className="text-left px-4 py-2.5 font-semibold">Fornecedor</th>
                            <th className="text-right px-4 py-2.5 font-semibold">Qtd.</th>
                            <th className="text-right px-4 py-2.5 font-semibold">Preço Unit.</th>
                            <th className="text-left px-4 py-2.5 font-semibold">Entrega Prev.</th>
                            <th className="w-10" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {compras.pedidos.map((p) => (
                            <tr key={p.id} className="hover:bg-blue-50/40">
                              <td className="px-4 py-3 font-mono text-xs font-bold text-blue-700">{p.numero}</td>
                              <td className="px-4 py-3">
                                <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold", {
                                  "bg-gray-100 text-gray-600":   p.status === "RASCUNHO",
                                  "bg-amber-100 text-amber-700": p.status === "ENVIADO",
                                  "bg-blue-100 text-blue-700":   p.status === "CONFIRMADO",
                                  "bg-green-100 text-green-700": p.status === "ENTREGUE",
                                  "bg-red-100 text-red-700":     p.status === "CANCELADO",
                                })}>
                                  {p.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-700 text-xs font-medium">
                                {p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-800">
                                {decimalToNumber(p.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-700 font-semibold">
                                {formatBRL(decimalToNumber(p.precoUnitario))}
                              </td>
                              <td className="px-4 py-3 text-gray-600 text-xs">
                                {p.dataEntregaPrevista ? new Date(p.dataEntregaPrevista).toLocaleDateString("pt-BR") : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-3 py-3">
                                <Link href={`/suprimentos/pedidos-compra/${p.id}`} className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 inline-flex">
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* ── Conferências ── */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <PackageCheck className="w-4 h-4 text-emerald-500" />
                    Conferências de Recebimento
                    <span className="text-xs font-normal text-gray-400">({compras.conferencias.length})</span>
                  </h3>
                  {compras.conferencias.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 border border-dashed border-gray-200 rounded-xl text-sm">
                      Nenhuma conferência de recebimento para este produto
                    </div>
                  ) : (
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600 uppercase tracking-wide">
                          <tr>
                            <th className="text-left px-4 py-2.5 font-semibold">Número</th>
                            <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                            <th className="text-left px-4 py-2.5 font-semibold">Pedido</th>
                            <th className="text-left px-4 py-2.5 font-semibold">Fornecedor</th>
                            <th className="text-right px-4 py-2.5 font-semibold">Pedido</th>
                            <th className="text-right px-4 py-2.5 font-semibold">Recebido</th>
                            <th className="text-center px-4 py-2.5 font-semibold">Divergência</th>
                            <th className="w-10" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {compras.conferencias.map((c) => (
                            <tr key={c.id} className="hover:bg-blue-50/40">
                              <td className="px-4 py-3 font-mono text-xs font-bold text-blue-700">{c.numero}</td>
                              <td className="px-4 py-3">
                                <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold", {
                                  "bg-amber-100 text-amber-700": c.status === "PENDENTE",
                                  "bg-blue-100 text-blue-700":   c.status === "EM_ANDAMENTO",
                                  "bg-green-100 text-green-700": c.status === "CONCLUIDA",
                                  "bg-red-100 text-red-700":     c.status === "CANCELADA",
                                })}>
                                  {c.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">{c.pedido.numero}</td>
                              <td className="px-4 py-3 text-gray-700 text-xs font-medium">
                                {c.pedido.fornecedor.nomeFantasia || c.pedido.fornecedor.razaoSocial}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-800">
                                {decimalToNumber(c.quantidadePedida).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                                {decimalToNumber(c.quantidadeRecebida).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {c.divergencia
                                  ? <span className="text-xs text-red-700 font-semibold bg-red-100 border border-red-200 px-2.5 py-1 rounded-full">Sim</span>
                                  : <span className="text-xs text-emerald-700 font-semibold bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-full">OK</span>
                                }
                              </td>
                              <td className="px-3 py-3">
                                <Link href={`/suprimentos/conferencias/${c.id}`} className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 inline-flex">
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── RELATÓRIO ───────────────────────────────────────────────── */}
        {tab === "relatorio" && (() => {
          // Period cutoff
          const corte = new Date();
          corte.setDate(corte.getDate() - periodoDias);

          const movPeriodo  = item.movimentacoes.filter((m) => new Date(m.createdAt) >= corte);
          const saidasPer   = movPeriodo.filter((m) => m.tipo === "SAIDA");
          const entradasPer = movPeriodo.filter((m) => m.tipo === "ENTRADA");

          const totalSaidaPer    = saidasPer.reduce((s, m) => s + decimalToNumber(m.quantidade), 0);
          const totalEntradaPer  = entradasPer.reduce((s, m) => s + decimalToNumber(m.quantidade), 0);
          const mesesPeriodo     = periodoDias / 30;

          // Consumo Médio Mensal
          const consumoMedioMensal = mesesPeriodo > 0 ? totalSaidaPer / mesesPeriodo : 0;
          const consumoDiario      = periodoDias > 0   ? totalSaidaPer / periodoDias   : 0;

          // Giro de Estoque (anualizado)
          const giro = estoqueTotal > 0 ? (totalSaidaPer * (365 / periodoDias)) / estoqueTotal : 0;

          // Cobertura de Estoque em dias
          const coberturaDias = consumoDiario > 0 ? estoqueTotal / consumoDiario : Infinity;

          // Lead time médio dos fornecedores
          const fornComLead = item.fornecedores.filter((f) => f.prazoEntregaDias && f.prazoEntregaDias > 0);
          const leadTimeMedio = fornComLead.length > 0
            ? fornComLead.reduce((s, f) => s + (f.prazoEntregaDias ?? 0), 0) / fornComLead.length
            : 14; // fallback 14 dias

          // Estoque de Segurança = consumo diário × lead time × fator segurança (1.5)
          const estoqueSeguranca = consumoDiario * leadTimeMedio * 1.5;

          // Taxa de Ruptura: % de saídas que levaram o saldo a ≤ 0
          const totalSaidasAll   = item.movimentacoes.filter((m) => m.tipo === "SAIDA").length;
          const rupturaEvents    = item.movimentacoes.filter(
            (m) => m.tipo === "SAIDA" && decimalToNumber(m.saldoDepois) <= 0
          ).length;
          const taxaRuptura = totalSaidasAll > 0 ? (rupturaEvents / totalSaidasAll) * 100 : 0;

          const sigla = item.unidade?.sigla || item.unidadeMedida;
          const semDados = item.movimentacoes.length === 0;

          return (
            <div className="space-y-6">
              {/* Period selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">Período de análise:</span>
                {([30, 90, 180, 365] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setPeriodoDias(d)}
                    className={cn(
                      "px-3 py-1 text-xs font-medium rounded-full border transition-colors",
                      periodoDias === d
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-gray-200 text-gray-500 hover:border-gray-400"
                    )}
                  >
                    {d === 365 ? "1 ano" : `${d} dias`}
                  </button>
                ))}
                <span className="text-xs text-gray-400 ml-2">
                  ({saidasPer.length} saídas · {entradasPer.length} entradas no período)
                </span>
              </div>

              {semDados && (
                <div className="text-center py-12 text-gray-400 border border-dashed border-gray-200 rounded-xl">
                  <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Sem movimentações para calcular indicadores</p>
                </div>
              )}

              {!semDados && (
                <>
                  {/* KPI grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">

                    {/* Consumo Médio */}
                    <KpiCard
                      icon={<BarChart2 className="w-5 h-5" />}
                      color="blue"
                      title="Consumo Médio Mensal"
                      value={consumoMedioMensal > 0
                        ? `${consumoMedioMensal.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ${sigla}`
                        : "—"}
                      sub={consumoDiario > 0
                        ? `${consumoDiario.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${sigla}/dia`
                        : `${totalSaidaPer.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${sigla} no período`}
                      hint={{
                        formula: "Total de saídas no período ÷ número de meses. O consumo diário é calculado dividindo pelo total de dias.",
                        interpretation: "Indica quanto do produto é consumido por mês em média. Use para planejar a frequência e quantidade de reposição."
                      }}
                    />

                    {/* Giro de Estoque */}
                    <KpiCard
                      icon={<RefreshCw className="w-5 h-5" />}
                      color={giro >= 6 ? "emerald" : giro >= 2 ? "amber" : "red"}
                      title="Giro de Estoque"
                      value={giro > 0 ? `${giro.toFixed(2)}×/ano` : "—"}
                      sub={giro >= 6 ? "Giro saudável" : giro >= 2 ? "Giro moderado" : giro > 0 ? "Giro baixo — capital imobilizado" : "Sem saídas no período"}
                      hint={{
                        formula: "(Total de saídas no período × 365 ÷ dias do período) ÷ estoque atual.",
                        interpretation: "Quantas vezes o estoque é renovado por ano. Giro ≥ 6 = saudável. Entre 2 e 6 = moderado. Abaixo de 2 = capital imobilizado, risco de obsolescência."
                      }}
                    />

                    {/* Cobertura de Estoque */}
                    <KpiCard
                      icon={<Clock className="w-5 h-5" />}
                      color={coberturaDias === Infinity ? "gray" : coberturaDias >= 60 ? "emerald" : coberturaDias >= 14 ? "amber" : "red"}
                      title="Cobertura de Estoque"
                      value={coberturaDias === Infinity
                        ? "∞"
                        : coberturaDias >= 30
                          ? `${(coberturaDias / 30).toFixed(1)} meses`
                          : `${Math.round(coberturaDias)} dias`}
                      sub={coberturaDias === Infinity
                        ? "Sem consumo no período"
                        : `Com base no consumo de ${periodoDias} dias`}
                      hint={{
                        formula: "Estoque atual ÷ consumo diário médio.",
                        interpretation: "Por quantos dias/meses o estoque suporta a demanda sem reposição. Abaixo de 14 dias = risco de ruptura. Acima de 60 dias pode indicar excesso."
                      }}
                    />

                    {/* Estoque de Segurança */}
                    <KpiCard
                      icon={<ShieldCheck className="w-5 h-5" />}
                      color="violet"
                      title="Estoque de Segurança"
                      value={estoqueSeguranca > 0
                        ? `${estoqueSeguranca.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${sigla}`
                        : "—"}
                      sub={`Lead time: ${Math.round(leadTimeMedio)} dias · fator: 1,5`}
                      hint={{
                        formula: "Consumo diário × lead time médio dos fornecedores × 1,5 (fator de segurança).",
                        interpretation: "Quantidade mínima recomendada em estoque para absorver atrasos de fornecedor ou picos de demanda. Se o estoque atual estiver abaixo deste valor, considere repor."
                      }}
                    />

                    {/* Taxa de Ruptura */}
                    <KpiCard
                      icon={<AlertOctagon className="w-5 h-5" />}
                      color={taxaRuptura === 0 ? "emerald" : taxaRuptura <= 5 ? "amber" : "red"}
                      title="Taxa de Ruptura"
                      value={totalSaidasAll > 0 ? `${taxaRuptura.toFixed(1)}%` : "—"}
                      sub={totalSaidasAll > 0
                        ? `${rupturaEvents} de ${totalSaidasAll} saídas com saldo zerado`
                        : "Sem saídas registradas"}
                      hint={{
                        formula: "(Nº de saídas que levaram o saldo a ≤ 0 ÷ total de saídas) × 100.",
                        interpretation: "Frequência com que o estoque zerou após uma saída — proxy de stockout. 0% = ideal. Acima de 5% indica necessidade de revisar ponto de reposição."
                      }}
                    />

                    {/* Resumo período */}
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resumo do Período</p>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Entradas</span>
                        <span className="font-semibold text-emerald-700">+{totalEntradaPer.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {sigla}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Saídas</span>
                        <span className="font-semibold text-red-700">−{totalSaidaPer.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {sigla}</span>
                      </div>
                      <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
                        <span className="text-gray-500">Estoque Atual</span>
                        <span className="font-bold text-gray-900">{estoqueTotal.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {sigla}</span>
                      </div>
                    </div>
                  </div>

                  {/* Consumo mensal por mês — last 12 months */}
                  {(() => {
                    // Build monthly consumption chart data
                    const today = new Date();
                    const meses: { label: string; saida: number; entrada: number }[] = [];
                    for (let i = 11; i >= 0; i--) {
                      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
                      const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
                      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
                      const movMes = item.movimentacoes.filter((m) => {
                        const cd = new Date(m.createdAt);
                        return cd >= d && cd <= fim;
                      });
                      meses.push({
                        label,
                        saida:   movMes.filter((m) => m.tipo === "SAIDA").reduce((s, m) => s + decimalToNumber(m.quantidade), 0),
                        entrada: movMes.filter((m) => m.tipo === "ENTRADA").reduce((s, m) => s + decimalToNumber(m.quantidade), 0),
                      });
                    }
                    const maxVal = Math.max(...meses.map((m) => Math.max(m.saida, m.entrada)), 1);
                    const hasAny = meses.some((m) => m.saida > 0 || m.entrada > 0);
                    if (!hasAny) return null;
                    return (
                      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Movimentação Mensal — últimos 12 meses</p>
                        <div className="flex items-end gap-1 h-28">
                          {meses.map((m, idx) => (
                            <div key={idx} className="flex-1 flex flex-col items-center gap-0.5 group">
                              <div className="w-full flex items-end gap-0.5 h-24">
                                <div
                                  className="flex-1 bg-emerald-200 hover:bg-emerald-400 rounded-t transition-colors"
                                  style={{ height: `${(m.entrada / maxVal) * 100}%` }}
                                  title={`Entrada: ${m.entrada.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`}
                                />
                                <div
                                  className="flex-1 bg-red-200 hover:bg-red-400 rounded-t transition-colors"
                                  style={{ height: `${(m.saida / maxVal) * 100}%` }}
                                  title={`Saída: ${m.saida.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`}
                                />
                              </div>
                              <span className="text-[9px] text-gray-400 rotate-45 origin-left mt-1 whitespace-nowrap">{m.label}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-4 mt-4 text-xs text-gray-500">
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-200 inline-block" />Entradas</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-200 inline-block" />Saídas</span>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          );
        })()}

      </div>

      {/* ── Edit movimentação dialog ─────────────────────────────────────── */}
      {editMov && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-base">Editar Movimentação</h3>
              <button type="button" onClick={() => setEditMov(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 -mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Apenas documento, observações e unidade podem ser alterados para preservar o saldo.
            </p>
            <div className="space-y-4">
              {editMovError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editMovError}</p>}
              {/* Unidade */}
              {itemUnidades.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Unidade</Label>
                  <div className="flex flex-wrap gap-2">
                    {itemUnidades.map((iu) => (
                      <button
                        key={iu.id} type="button"
                        onClick={() => setEditMov((p) => p ? { ...p, unidadeId: p.unidadeId === iu.unidade.id ? "" : iu.unidade.id } : p)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                          editMov.unidadeId === iu.unidade.id
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                        )}
                      >
                        {iu.unidade.sigla}
                        {iu.isPrincipal && <span className="ml-1 text-[10px] text-gray-400">(padrão)</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Documento</Label>
                <Input
                  value={editMov.documento}
                  onChange={(e) => setEditMov((p) => p ? { ...p, documento: e.target.value } : p)}
                  placeholder="NF, OS…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Input
                  value={editMov.observacoes}
                  onChange={(e) => setEditMov((p) => p ? { ...p, observacoes: e.target.value } : p)}
                  placeholder="Opcional"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <Button
                size="sm" variant="ghost"
                className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2"
                onClick={() => {
                  const mov = item?.movimentacoes.find((m) => m.id === editMov?.id);
                  if (mov) { setEditMov(null); setDeleteMovConfirm(mov); }
                }}
                disabled={editMovSaving}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />Excluir
              </Button>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditMov(null)} disabled={editMovSaving}>Cancelar</Button>
                <Button size="sm" onClick={submitEditMov} disabled={editMovSaving}>
                  {editMovSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                  Salvar
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Delete movimentação confirm dialog ───────────────────────────────── */}
      {deleteMovConfirm && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Excluir movimentação?</p>
                <p className="text-sm text-gray-500 mt-1">
                  <span className={cn(
                    "font-semibold",
                    deleteMovConfirm.tipo === "ENTRADA" ? "text-emerald-600" : "text-red-600"
                  )}>
                    {deleteMovConfirm.tipo === "ENTRADA" ? "+" : "−"}{decimalToNumber(deleteMovConfirm.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                    {deleteMovConfirm.unidade ? ` ${deleteMovConfirm.unidade.sigla}` : ""}
                  </span>
                  {deleteMovConfirm.documento ? ` · ${deleteMovConfirm.documento}` : ""}
                  {" · "}{formatDateTime(deleteMovConfirm.createdAt)}
                </p>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                  O saldo do estoque será revertido automaticamente.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setDeleteMovConfirm(null)} disabled={!!deletingMovId}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => confirmDeleteMov(deleteMovConfirm.id)}
                disabled={!!deletingMovId}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deletingMovId === deleteMovConfirm.id && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Excluir
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Dialog de movimentação rápida ──────────────────────────────── */}
      {/* ── Modal: Nova Necessidade de Compra ──────────────────────── */}
      {showNecessidade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Nova Necessidade de Compra</h3>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{item.codigo} — {item.descricao}</p>
              </div>
              <button onClick={() => setShowNecessidade(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Quantidade Necessária *</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" step="0.001" min="0.001"
                    value={necForm.quantidade}
                    onChange={(e) => setNecForm((p) => ({ ...p, quantidade: e.target.value }))}
                    placeholder="0"
                    autoFocus
                    className="flex-1"
                  />
                  <span className="text-sm text-gray-500 font-mono shrink-0">
                    {item.unidade?.sigla || item.unidadeMedida}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Solicitante</Label>
                  <Input
                    value={necForm.solicitante}
                    onChange={(e) => setNecForm((p) => ({ ...p, solicitante: e.target.value }))}
                    placeholder="Nome do solicitante"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Prazo Necessário</Label>
                  <Input
                    type="date"
                    value={necForm.dataNecessidade}
                    onChange={(e) => setNecForm((p) => ({ ...p, dataNecessidade: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Observação</Label>
                <Input
                  value={necForm.observacao}
                  onChange={(e) => setNecForm((p) => ({ ...p, observacao: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>

              {necError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{necError}</p>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowNecessidade(false)} disabled={necSaving}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={submitNecessidade}
                disabled={necSaving || !necForm.quantidade}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {necSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
                Criar Necessidade
              </Button>
            </div>
          </div>
        </div>
      )}

      {showMovDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Nova Movimentação</h3>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{item.codigo} — {item.descricao}</p>
              </div>
              <button onClick={() => setShowMovDialog(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tipo toggle */}
            <div className="grid grid-cols-2 gap-2">
              {(["ENTRADA", "SAIDA"] as const).map((t) => (
                <button
                  key={t} type="button"
                  onClick={() => setMovForm((p) => ({ ...p, tipo: t, localEstoqueId: "" }))}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 text-sm font-medium transition-colors",
                    movForm.tipo === t
                      ? t === "ENTRADA"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-red-500 bg-red-50 text-red-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  )}
                >
                  {t === "ENTRADA" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {t === "ENTRADA" ? "Entrada" : "Saída"}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {/* Local de Estoque */}
              {(() => {
                // For SAIDA, only show locations where the product has stock > 0
                const locaisComSaldo = movForm.tipo === "SAIDA"
                  ? item.estoqueItems
                      .filter((e) => decimalToNumber(e.quantidadeAtual) > 0 && e.localEstoque)
                      .map((e) => ({
                        value: e.localEstoque!.id,
                        label: `${e.localEstoque!.nome} · saldo: ${decimalToNumber(e.quantidadeAtual).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}`,
                      }))
                  : locaisEstoque.map((l) => ({ value: l.id, label: l.nome }));

                return (
                  <div className="space-y-1.5">
                    <Label>Local de Estoque *</Label>
                    {movForm.tipo === "SAIDA" && locaisComSaldo.length === 0 ? (
                      <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        Nenhum local com saldo disponível para este produto.
                      </div>
                    ) : (
                      <ComboboxWithCreate
                        key={`local-${movForm.tipo}`}
                        options={locaisComSaldo}
                        value={movForm.localEstoqueId}
                        onChange={(v) => setMovForm((p) => ({ ...p, localEstoqueId: v }))}
                        allowNone={false}
                        placeholder={movForm.tipo === "SAIDA" ? "Selecionar local com saldo..." : "Selecionar local..."}
                        {...(movForm.tipo === "ENTRADA" ? {
                          createHref: "/suprimentos/locais-estoque/novo",
                          createParam: "nome",
                          createLabel: "local de estoque",
                          renderCreateModal: (args: Parameters<NonNullable<React.ComponentProps<typeof ComboboxWithCreate>["renderCreateModal"]>>[0]) => <LocalEstoqueQuickCreate {...args} />,
                        } : {})}
                      />
                    )}
                  </div>
                );
              })()}

              {/* Unidade + Quantidade */}
              {(() => {
                const principal = itemUnidades.find((iu) => iu.isPrincipal);
                const selectedIU = itemUnidades.find((iu) => iu.unidade.id === movForm.unidadeId);
                const isSecondary = selectedIU && !selectedIU.isPrincipal && !!selectedIU.fatorConversao;
                const fator = isSecondary ? Number(selectedIU!.fatorConversao) : 1;
                const qtd = parseFloat(movForm.quantidade) || 0;
                const qtdConvertida = qtd * fator;

                // Fallback sigla when no itemUnidades loaded yet
                const principalSigla = principal?.unidade.sigla
                  ?? item?.unidade?.sigla
                  ?? item?.unidadeMedida
                  ?? "un.";

                return (
                  <>
                    {/* Unidade selector — always shown */}
                    <div className="space-y-1.5">
                      <Label>Unidade *</Label>
                      {itemUnidades.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {itemUnidades.map((iu) => (
                            <button
                              key={iu.id}
                              type="button"
                              onClick={() => setMovForm((p) => ({ ...p, unidadeId: iu.unidade.id }))}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                                movForm.unidadeId === iu.unidade.id
                                  ? "border-blue-500 bg-blue-50 text-blue-700"
                                  : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                              )}
                            >
                              <span className="font-mono font-semibold">{iu.unidade.sigla}</span>
                              {iu.isPrincipal && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1 rounded font-medium">padrão</span>
                              )}
                              {!iu.isPrincipal && iu.fatorConversao && (
                                <span className="text-[10px] text-gray-400">
                                  = {Number(iu.fatorConversao).toLocaleString("pt-BR", { maximumFractionDigits: 6 })} {principalSigla}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        // No itemUnidades defined — show item's base unit as read-only badge
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-mono font-semibold">
                            {principalSigla}
                            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1 rounded font-medium">padrão</span>
                          </span>
                          <span className="text-xs text-gray-400">Cadastre unidades na aba Unidades para mais opções</span>
                        </div>
                      )}
                    </div>

                    {/* Quantidade */}
                    <div className="space-y-1.5">
                      <Label>
                        Quantidade *
                        <span className="ml-1 text-xs font-normal text-gray-500">
                          em {selectedIU?.unidade.sigla ?? principalSigla}
                        </span>
                      </Label>
                      <Input
                        type="number" step="0.001" min="0.001"
                        value={movForm.quantidade}
                        onChange={(e) => setMovForm((p) => ({ ...p, quantidade: e.target.value }))}
                        placeholder="0"
                      />
                      {/* Conversion preview */}
                      {isSecondary && qtd > 0 && (
                        <div className="flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
                          <span className="font-mono font-semibold">
                            {qtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {selectedIU!.unidade.sigla}
                          </span>
                          <span className="text-amber-500">→</span>
                          <span className="font-mono font-bold text-emerald-700">
                            {qtdConvertida.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {principalSigla}
                          </span>
                          <span className="text-amber-600 ml-1">(unidade padrão)</span>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}

              {/* Custo unitário (só ENTRADA) */}
              {movForm.tipo === "ENTRADA" && (
                <div className="space-y-1.5">
                  <Label>Custo Unitário (R$)</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={movForm.valorUnitario}
                    onChange={(e) => setMovForm((p) => ({ ...p, valorUnitario: e.target.value }))}
                    placeholder="0,00"
                  />
                </div>
              )}

              {/* Documento e Observações */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Documento</Label>
                  <Input
                    value={movForm.documento}
                    onChange={(e) => setMovForm((p) => ({ ...p, documento: e.target.value }))}
                    placeholder="NF, OS…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Observações</Label>
                  <Input
                    value={movForm.observacoes}
                    onChange={(e) => setMovForm((p) => ({ ...p, observacoes: e.target.value }))}
                    placeholder="Opcional"
                  />
                </div>
              </div>

              {movError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{movError}</p>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowMovDialog(false)} disabled={movSaving}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={submitMov}
                disabled={movSaving}
                className={movForm.tipo === "SAIDA" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}
              >
                {movSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Registrar {movForm.tipo === "ENTRADA" ? "Entrada" : "Saída"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function Field({ label, children, colSpan, addHref, addLabel }: {
  label: string; children: React.ReactNode; colSpan?: boolean;
  addHref?: string; addLabel?: string;
}) {
  return (
    <div className={cn("space-y-1", colSpan && "col-span-2")}>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-gray-500">{label}</Label>
        {addHref && (
          <Link href={addHref} className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-500 hover:text-blue-700">
            <Plus className="w-3 h-3" />
            {addLabel ?? "Novo"}
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function Info({ label, value, mono, colSpan }: { label: string; value?: string | null; mono?: boolean; colSpan?: boolean }) {
  return (
    <div className={cn(colSpan && "col-span-2")}>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={cn("text-sm text-gray-900", mono && "font-mono")}>{value || "—"}</p>
    </div>
  );
}

const KPI_COLORS: Record<string, { bg: string; icon: string; value: string; border: string }> = {
  blue:    { bg: "bg-blue-50",    icon: "text-blue-500",    value: "text-blue-900",    border: "border-blue-100" },
  emerald: { bg: "bg-emerald-50", icon: "text-emerald-500", value: "text-emerald-900", border: "border-emerald-100" },
  amber:   { bg: "bg-amber-50",   icon: "text-amber-500",   value: "text-amber-900",   border: "border-amber-100" },
  red:     { bg: "bg-red-50",     icon: "text-red-500",     value: "text-red-900",     border: "border-red-100" },
  violet:  { bg: "bg-violet-50",  icon: "text-violet-500",  value: "text-violet-900",  border: "border-violet-100" },
  gray:    { bg: "bg-gray-50",    icon: "text-gray-400",    value: "text-gray-700",    border: "border-gray-200" },
};

function KpiCard({
  icon, color = "blue", title, value, sub, hint,
}: {
  icon: React.ReactNode;
  color?: string;
  title: string;
  value: string;
  sub?: string;
  hint?: { formula: string; interpretation: string };
}) {
  const c = KPI_COLORS[color] ?? KPI_COLORS.blue;
  return (
    <div className={cn("rounded-xl border px-5 py-4 space-y-1 relative", c.bg, c.border)}>
      <div className="flex items-start justify-between mb-2">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", c.bg, c.icon)}>
          {icon}
        </div>
        {hint && (
          <div className="group relative">
            <button className="text-gray-400 hover:text-gray-600 transition-colors p-0.5 rounded">
              <Info className="w-3.5 h-3.5" />
            </button>
            {/* Tooltip */}
            <div className="absolute right-0 top-6 z-50 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-left
                            invisible opacity-0 group-hover:visible group-hover:opacity-100
                            transition-all duration-150 pointer-events-none">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Cálculo</p>
              <p className="text-xs text-gray-700 leading-relaxed mb-2.5">{hint.formula}</p>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Interpretação</p>
              <p className="text-xs text-gray-700 leading-relaxed">{hint.interpretation}</p>
            </div>
          </div>
        )}
      </div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide leading-none">{title}</p>
      <p className={cn("text-2xl font-bold leading-tight", c.value)}>{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}
