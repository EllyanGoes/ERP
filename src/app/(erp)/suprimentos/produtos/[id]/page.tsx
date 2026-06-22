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
  ChevronRight, Pencil, Save, X, Plus, Trash2, Printer,
  Loader2, Package, TrendingUp, TrendingDown, ArrowUpDown,
  BarChart2, ShieldCheck, RefreshCw, Clock, AlertOctagon, AlertTriangle,
  ClipboardList, FileText, PackageCheck, ExternalLink, Info as InfoIcon, Star, Activity, Ruler,
} from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { UnidadeQuickCreate, LocalEstoqueQuickCreate } from "@/components/shared/QuickCreateDialogs";
import CategoriaEstoqueSelect from "@/components/shared/CategoriaEstoqueSelect";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import { cn, formatBRL, decimalToNumber, formatDate } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";
import type { CategoriaEstoque } from "@prisma/client";
import { rotuloCategoria } from "@/lib/categoria-estoque-ui";

// ── Types ──────────────────────────────────────────────────────────────────────
type Movimentacao = {
  id: string;
  tipo: string;
  quantidade: unknown;
  saldoAntes: unknown;
  saldoDepois: unknown;
  documento: string | null;
  observacoes: string | null;
  minutaFisica?: string | null;
  minutaDataEmissao?: string | null;
  minutaDataEntrega?: string | null;
  createdAt: string;
  pedidoVendaItemId: string | null;
  conferenciaItemId: string | null;
  loteId: string | null;
  localEstoqueId?: string | null;
  valorUnitario?: unknown;
  lote?: { dataMovimentacao: string | null } | null;
  localEstoque?: { id: string; nome: string; filial: { id: string; razaoSocial: string } | null } | null;
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
  categoriaEstoque: CategoriaEstoque | null;
  ncm: string | null;
  precoVenda: unknown;
  precoVendaMedio?: unknown;
  precoCusto: unknown;
  ativo: boolean;
  favorito: boolean;
  vendavel: boolean;
  comodato: boolean;
  consumivel: boolean;
  estoqueMinimo: unknown;
  estoqueMaximo: unknown;
  pontoReposicao: unknown;
  leadTimeDias: number | null;
  observacoes: string | null;
  custosEmpresa?: Array<{ empresaId: string; precoCusto: unknown }>;
  estoqueItems: Array<{
    id: string;
    empresaId: string;
    empresa: { id: string; razaoSocial: string; nomeFantasia: string | null };
    quantidadeAtual: unknown;
    quantidadeMin: unknown;
    quantidadeMax: unknown;
    localizacao: string | null;
    localEstoque: {
      id: string;
      nome: string;
      filial: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
    } | null;
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
    pedido: { numero: string; fornecedor: { razaoSocial: string; nomeFantasia: string | null } } | null;
    quantidadePedida: unknown; quantidadeRecebida: unknown; divergencia: boolean;
  }>;
};

const TIPO_LABEL: Record<string, string> = {
  PRODUTO: "Produto",
  MATERIA_PRIMA: "Matéria-prima",
  SERVICO: "Serviço",
};

const TIPO_MOV_COLOR: Record<string, string> = {
  ENTRADA: "text-success bg-success/10",
  SAIDA: "text-danger bg-danger/10",
  AJUSTE: "text-info bg-info/10",
  TRANSFERENCIA: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/15",
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
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";
  const [tab, setTab] = useState<"dados" | "fornecedores" | "estoques" | "movimentacoes" | "compras" | "relatorio" | "unidades">("dados");
  const [empresaEstoqueId, setEmpresaEstoqueId] = useState(""); // "" = todas as empresas
  const [periodoDias, setPeriodoDias] = useState<30 | 90 | 180 | 365>(90);
  const [item, setItem] = useState<Item | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Lookup lists for edit dropdowns
  const [unidades, setUnidades]     = useState<UnidadeOpt[]>([]);

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
  const [confirmPrincipal, setConfirmPrincipal] = useState<{ itemUnidadeId: string; unidadeId: string; sigla: string; nome: string } | null>(null);
  // Edit/add unit modal
  const [unidadeModal, setUnidadeModal] = useState<{
    mode: "add" | "edit";
    id?: string;          // itemUnidadeId (edit only)
    unidadeId: string;
    sigla: string;
    nome: string;
    fatorConversao: string;
    baseUnidadeId: string;
    isPrincipal: boolean;
  } | null>(null);
  const [unidadeModalSaving, setUnidadeModalSaving] = useState(false);
  const [unidadeModalError, setUnidadeModalError] = useState("");

  // Movimentação rápida
  const [showMovDialog, setShowMovDialog] = useState(false);
  const [locaisEstoque, setLocaisEstoque] = useState<{ id: string; nome: string; filial: { id: string; razaoSocial: string } | null }[]>([]);
  const [movForm, setMovForm] = useState({
    tipo: "ENTRADA" as "ENTRADA" | "SAIDA",
    localEstoqueId: "",
    unidadeId: "",
    quantidade: "",
    valorUnitario: "",
    documento: "",
    observacoes: "",
    dataMovimentacao: "",
  });
  const [movSaving, setMovSaving] = useState(false);
  const [movError, setMovError] = useState("");

  // Edit movimentação
  const [editMov, setEditMov] = useState<{
    id: string;
    tipo: string;
    localEstoqueNome: string;
    unidadeId: string;
    quantidade: string;
    valorUnitario: string;
    documento: string;
    observacoes: string;
    dataMovimentacao: string;
  } | null>(null);
  const [editMovSaving, setEditMovSaving] = useState(false);
  const [editMovError, setEditMovError] = useState("");

  // Delete movimentação
  const [deletingMovId, setDeletingMovId] = useState<string | null>(null);
  const [deleteMovConfirm, setDeleteMovConfirm] = useState<Movimentacao | null>(null);

  // Movimentações — filtros (período, local de estoque, tipo)
  const [movPeriodo, setMovPeriodo] = useState<DateRange>({ from: "", to: "" });
  const [movLocalFilter, setMovLocalFilter] = useState("");
  const [movTipoFilter, setMovTipoFilter] = useState<"" | "ENTRADA" | "SAIDA">("");

  // Inserir Saldo Inicial
  const [showSaldoDialog, setShowSaldoDialog] = useState(false);
  const [saldoFilialFilter, setSaldoFilialFilter] = useState("");
  const [saldoForm, setSaldoForm] = useState({
    localEstoqueId: "",
    saldo: "",
    custo: "",
    endereco: "",
    unidadeEntradaId: "", // ID da unidade escolhida para entrada
    data: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    editMovId: "",        // non-empty = editing an existing movement
  });
  const [saldoSaving, setSaldoSaving] = useState(false);
  const [saldoError, setSaldoError] = useState("");

  // Inline edit for estoqueItem rows (admin only)
  const [editingEstoqueId, setEditingEstoqueId] = useState<string | null>(null);
  const [estoqueEditForm, setEstoqueEditForm] = useState({ quantidadeAtual: "", localizacao: "" });
  const [estoqueEditSaving, setEstoqueEditSaving] = useState(false);
  const [estoqueEditError, setEstoqueEditError] = useState("");

  // Favorito toggle
  const [favoritoSaving, setFavoritoSaving] = useState(false);

  async function toggleFavorito() {
    if (!item || favoritoSaving) return;
    setFavoritoSaving(true);
    try {
      const res = await fetch(`/api/suprimentos/produtos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorito: !item.favorito }),
      });
      if (res.ok) await load();
    } catch { /* ignore */ }
    finally { setFavoritoSaving(false); }
  }

  // Parâmetros de reposição inline edit
  const [paramEdit, setParamEdit] = useState<null | "estoqueMinimo" | "estoqueMaximo" | "pontoReposicao" | "leadTimeDias">(null);
  const [paramValue, setParamValue] = useState("");
  const [paramSaving, setParamSaving] = useState(false);

  async function saveParam(field: string, value: string) {
    setParamSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (field === "leadTimeDias") {
        payload[field] = value === "" ? null : parseInt(value);
      } else {
        payload[field] = value === "" ? null : parseFloat(value);
      }
      const res = await fetch(`/api/suprimentos/produtos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) { await load(); setParamEdit(null); }
    } catch { /* ignore */ }
    finally { setParamSaving(false); }
  }

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

  function openEstoqueEdit(e: { id: string; quantidadeAtual: unknown; localizacao: string | null }) {
    setEstoqueEditForm({
      quantidadeAtual: decimalToNumber(e.quantidadeAtual).toLocaleString("en-US", { maximumFractionDigits: 3, useGrouping: false }),
      localizacao: e.localizacao ?? "",
    });
    setEstoqueEditError("");
    setEditingEstoqueId(e.id);
  }

  async function saveEstoqueEdit() {
    if (!editingEstoqueId) return;
    setEstoqueEditSaving(true);
    setEstoqueEditError("");
    try {
      const res = await fetch(`/api/suprimentos/estoque-items/${editingEstoqueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantidadeAtual: estoqueEditForm.quantidadeAtual,
          localizacao: estoqueEditForm.localizacao,
        }),
      });
      if (!res.ok) { setEstoqueEditError((await res.json()).error || "Erro ao salvar"); return; }
      setEditingEstoqueId(null);
      await load();
    } catch { setEstoqueEditError("Erro de conexão"); }
    finally { setEstoqueEditSaving(false); }
  }

  function openSaldoDialog() {
    const principalId = itemUnidades.find((iu) => iu.isPrincipal)?.unidade.id ?? item?.unidade?.id ?? "";
    const today = new Date().toISOString().slice(0, 10);
    setSaldoForm({ localEstoqueId: "", saldo: "", custo: "", endereco: "", unidadeEntradaId: principalId, data: today, editMovId: "" });
    setSaldoFilialFilter("");
    setSaldoError("");
    setShowSaldoDialog(true);
    if (locaisEstoque.length === 0) {
      fetch("/api/suprimentos/locais-estoque").then((r) => r.json()).then((j) => {
        const lista: typeof locaisEstoque = Array.isArray(j) ? j : (j.data ?? []);
        setLocaisEstoque(lista);
        // Auto-select Tramontin filial
        const tramontin = lista.find((l) => l.filial && /tramontin/i.test(l.filial.razaoSocial));
        if (tramontin?.filial) setSaldoFilialFilter(tramontin.filial.id);
      });
    } else {
      // Already loaded — auto-select if not yet set
      const tramontin = locaisEstoque.find((l) => l.filial && /tramontin/i.test(l.filial.razaoSocial));
      if (tramontin?.filial) setSaldoFilialFilter(tramontin.filial.id);
    }
    if (!unidadesLoaded) loadItemUnidades();
  }

  function openEditSaldoDialog(m: Movimentacao) {
    const today = new Date().toISOString().slice(0, 10);
    const movDate = m.lote?.dataMovimentacao
      ? new Date(m.lote.dataMovimentacao).toISOString().slice(0, 10)
      : new Date(m.createdAt).toISOString().slice(0, 10);

    // Determine what unit was used and reverse-convert quantity to that unit
    const selectedIU = m.unidade ? itemUnidades.find((iu) => iu.unidade.id === m.unidade!.id) : null;
    const fator = selectedIU && !selectedIU.isPrincipal && selectedIU.fatorConversao
      ? Number(selectedIU.fatorConversao) : 1;
    const qtdBase = parseFloat(String(m.quantidade));
    const qtdDisplay = fator !== 1 ? (qtdBase / fator).toString() : qtdBase.toString();

    const principalId = m.unidade?.id ?? itemUnidades.find((iu) => iu.isPrincipal)?.unidade.id ?? item?.unidade?.id ?? "";

    setSaldoForm({
      localEstoqueId: m.localEstoqueId ?? "",
      saldo: qtdDisplay,
      custo: m.valorUnitario ? String(parseFloat(String(m.valorUnitario))) : "",
      endereco: "",
      unidadeEntradaId: principalId,
      data: movDate || today,
      editMovId: m.id,
    });
    if (m.localEstoque?.filial) setSaldoFilialFilter(m.localEstoque.filial.id);
    setSaldoError("");
    setShowSaldoDialog(true);
    if (locaisEstoque.length === 0) {
      fetch("/api/suprimentos/locais-estoque").then((r) => r.json()).then((j) => {
        setLocaisEstoque(Array.isArray(j) ? j : (j.data ?? []));
      });
    }
    if (!unidadesLoaded) loadItemUnidades();
  }

  async function submitSaldo() {
    if (!saldoForm.localEstoqueId) { setSaldoError("Selecione o Local de Estoque"); return; }
    if (!saldoForm.saldo || parseFloat(saldoForm.saldo) <= 0) { setSaldoError("Informe o Saldo (deve ser maior que 0)"); return; }
    setSaldoSaving(true); setSaldoError("");
    try {
      // Resolve conversion: quantity entered × fatorConversao → base unit quantity
      const selectedIU = itemUnidades.find((iu) => iu.unidade.id === saldoForm.unidadeEntradaId);
      const fator = (selectedIU && !selectedIU.isPrincipal && selectedIU.fatorConversao)
        ? Number(selectedIU.fatorConversao) : 1;
      const qtdBase = parseFloat(saldoForm.saldo) * fator;

      if (saldoForm.editMovId) {
        // ── Edit mode: PATCH existing movement ─────────────────────────────
        const res = await fetch(`/api/suprimentos/movimentacoes/${saldoForm.editMovId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantidade: qtdBase,
            unidadeId: saldoForm.unidadeEntradaId || null,
            valorUnitario: saldoForm.custo ? parseFloat(saldoForm.custo) : null,
            dataMovimentacao: saldoForm.data ? new Date(saldoForm.data + "T00:00:00").toISOString() : null,
          }),
        });
        if (!res.ok) { setSaldoError((await res.json()).error || "Erro ao salvar"); return; }
      } else {
        // ── Create mode: POST new movement ─────────────────────────────────
        const res = await fetch("/api/suprimentos/movimentacoes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "ENTRADA",
            documento: "SALDO-INICIAL",
            observacoes: "Saldo inicial inserido manualmente",
            dataMovimentacao: saldoForm.data ? new Date(saldoForm.data + "T00:00:00").toISOString() : null,
            itens: [{
              itemId: id,
              localEstoqueId: saldoForm.localEstoqueId,
              quantidade: qtdBase,
              valorUnitario: saldoForm.custo ? parseFloat(saldoForm.custo) : undefined,
              localizacao: saldoForm.endereco || undefined,
            }],
          }),
        });
        if (!res.ok) { setSaldoError((await res.json()).error || "Erro ao registrar saldo"); return; }
      }
      setShowSaldoDialog(false);
      await load();
    } catch { setSaldoError("Erro de conexão"); }
    finally { setSaldoSaving(false); }
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
  useEffect(() => { loadItemUnidades(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Promise.all([
      fetch("/api/suprimentos/fornecedores").then((r) => r.json()),
      fetch("/api/suprimentos/unidades").then((r) => r.json()),
    ]).then(([forn, un]) => {
      setFornList(Array.isArray(forn) ? forn : (forn.data ?? []));
      setUnidades(Array.isArray(un) ? un : (un.data ?? []));
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

  async function removeItemUnidade(itemUnidadeId: string) {
    await fetch(`/api/suprimentos/produtos/${id}/unidades/${itemUnidadeId}`, { method: "DELETE" });
    loadItemUnidades();
  }

  function openAddUnidadeModal() {
    setUnidadeModalError("");
    setUnidadeModal({ mode: "add", unidadeId: "", sigla: "", nome: "", fatorConversao: "", baseUnidadeId: "", isPrincipal: false });
  }

  function openEditUnidadeModal(iu: { id: string; unidade: { id: string; sigla: string; nome: string }; fatorConversao: string | number | null; baseUnidade: { id: string } | null; isPrincipal: boolean }) {
    setUnidadeModalError("");
    setUnidadeModal({
      mode: "edit",
      id: iu.id,
      unidadeId: iu.unidade.id,
      sigla: iu.unidade.sigla,
      nome: iu.unidade.nome,
      fatorConversao: iu.fatorConversao != null ? String(iu.fatorConversao) : "",
      baseUnidadeId: iu.baseUnidade?.id ?? "",
      isPrincipal: iu.isPrincipal,
    });
  }

  async function saveUnidadeModal() {
    if (!unidadeModal) return;
    setUnidadeModalSaving(true);
    setUnidadeModalError("");
    try {
      if (unidadeModal.mode === "add") {
        if (!unidadeModal.unidadeId) { setUnidadeModalError("Selecione uma unidade."); setUnidadeModalSaving(false); return; }
        const res = await fetch(`/api/suprimentos/produtos/${id}/unidades`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unidadeId:     unidadeModal.unidadeId,
            baseUnidadeId: unidadeModal.baseUnidadeId || null,
            fatorConversao: unidadeModal.fatorConversao ? parseFloat(unidadeModal.fatorConversao) : null,
            isPrincipal: false,
          }),
        });
        if (!res.ok) { setUnidadeModalError((await res.json()).error || "Erro"); setUnidadeModalSaving(false); return; }
      } else {
        const res = await fetch(`/api/suprimentos/produtos/${id}/unidades/${unidadeModal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fatorConversao: unidadeModal.fatorConversao ? parseFloat(unidadeModal.fatorConversao) : null,
            baseUnidadeId: unidadeModal.baseUnidadeId || null,
          }),
        });
        if (!res.ok) { setUnidadeModalError((await res.json()).error || "Erro"); setUnidadeModalSaving(false); return; }
      }
      setUnidadeModal(null);
      loadItemUnidades();
    } catch { setUnidadeModalError("Erro de conexão"); }
    finally { setUnidadeModalSaving(false); }
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
    const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setMovForm({ tipo: "ENTRADA", localEstoqueId: "", unidadeId: defaultUnidadeId, quantidade: "", valorUnitario: "", documento: "", observacoes: "", dataMovimentacao: nowLocal });
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
          dataMovimentacao: movForm.dataMovimentacao ? new Date(movForm.dataMovimentacao).toISOString() : undefined,
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
    if (!editMov.quantidade || parseFloat(editMov.quantidade) <= 0) { setEditMovError("Informe a quantidade"); return; }
    setEditMovSaving(true); setEditMovError("");
    try {
      // Convert quantity using selected unit
      const selectedIU = itemUnidades.find((iu) => iu.unidade.id === editMov.unidadeId);
      const fator = (selectedIU && !selectedIU.isPrincipal && selectedIU.fatorConversao)
        ? Number(selectedIU.fatorConversao) : 1;
      const qtdBase = parseFloat(editMov.quantidade) * fator;

      const res = await fetch(`/api/suprimentos/movimentacoes/${editMov.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documento:        editMov.documento   || null,
          observacoes:      editMov.observacoes || null,
          unidadeId:        editMov.unidadeId   || null,
          quantidade:       qtdBase,
          valorUnitario:    editMov.tipo === "ENTRADA" && editMov.valorUnitario
                              ? parseFloat(editMov.valorUnitario) / fator
                              : null,
          dataMovimentacao: editMov.dataMovimentacao
                              ? new Date(editMov.dataMovimentacao).toISOString()
                              : null,
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

  // ── PDF: relatório de movimentações (extrato/kardex) ──────────────────────
  // Gera um PDF com o histórico de movimentações do produto e o saldo corrido
  // (Saldo Antes / Saldo Depois) para acompanhar furos de estoque e saldo.
  async function downloadMovimentacoes(movs: Movimentacao[], periodo: DateRange) {
    if (!item) return;
    const it = item;
    const { default: jsPDF }     = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc   = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // Ordena cronologicamente (mais antigo → mais recente) para o saldo correr de cima a baixo
    const ordenadas = [...movs].sort((a, b) => {
      const da = new Date(a.lote?.dataMovimentacao ?? a.createdAt).getTime();
      const db = new Date(b.lote?.dataMovimentacao ?? b.createdAt).getTime();
      return da - db;
    });

    const un = it.unidade?.sigla || it.unidadeMedida;
    const nf = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

    const totalEntrada = ordenadas.filter((m) => m.tipo === "ENTRADA").reduce((s, m) => s + decimalToNumber(m.quantidade), 0);
    const totalSaida   = ordenadas.filter((m) => m.tipo === "SAIDA").reduce((s, m) => s + decimalToNumber(m.quantidade), 0);
    const saldoFinal   = ordenadas.length ? decimalToNumber(ordenadas[ordenadas.length - 1].saldoDepois) : 0;

    // Cabeçalho com faixa azul (relatório de movimentações)
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageW, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.text("Relatório de Movimentações de Estoque", 14, 11);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`${it.codigo} — ${it.descricao}`, 14, 18);

    // Linha de informações (período + contagem)
    let periodoTxt = "Todo o histórico";
    if (periodo.from || periodo.to) {
      const f = periodo.from ? new Date(periodo.from + "T00:00:00").toLocaleDateString("pt-BR") : "início";
      const t = periodo.to   ? new Date(periodo.to   + "T00:00:00").toLocaleDateString("pt-BR") : "hoje";
      periodoTxt = `Período: ${f} a ${t}`;
    }
    doc.setTextColor(90);
    doc.setFontSize(8);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}   ·   ${ordenadas.length} movimentação(ões)   ·   ${periodoTxt}`, 14, 30);

    // Resumo destacado (espelha os cards da tela)
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(5, 150, 105);
    doc.text(`Entradas: +${nf(totalEntrada)} ${un}`, 14, 37);
    doc.setTextColor(220, 38, 38);
    doc.text(`Saídas: -${nf(totalSaida)} ${un}`, 100, 37);
    doc.setTextColor(37, 99, 235);
    doc.text(`Saldo atual: ${nf(saldoFinal)} ${un}`, 180, 37);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);

    const body = ordenadas.map((m) => {
      const sign   = m.tipo === "SAIDA" ? "-" : m.tipo === "ENTRADA" ? "+" : "";
      const unLin  = m.unidade?.sigla || un;
      const origem = (m.pedidoVendaItemId || m.conferenciaItemId) ? "Automática" : "Manual";
      return [
        formatDateTime(m.lote?.dataMovimentacao ?? m.createdAt),
        m.tipo,
        `${sign}${nf(decimalToNumber(m.quantidade))}`,
        unLin,
        nf(decimalToNumber(m.saldoAntes)),
        nf(decimalToNumber(m.saldoDepois)),
        origem,
        m.documento || "—",
        m.minutaFisica || "—",
        m.minutaDataEmissao ? formatDate(m.minutaDataEmissao) : "—",
        m.minutaDataEntrega ? formatDate(m.minutaDataEntrega) : "—",
        m.observacoes || "—",
      ];
    });

    autoTable(doc, {
      startY: 42,
      head: [["Data", "Tipo", "Quantidade", "Un.", "Saldo Antes", "Saldo Depois", "Origem", "Documento", "Minuta Física", "Emissão", "Entrega", "Obs."]],
      body,
      foot: [[
        { content: "Totais do período", colSpan: 4, styles: { halign: "left", fontStyle: "bold" } },
        { content: `Entradas: +${nf(totalEntrada)}   ·   Saídas: -${nf(totalSaida)}`, colSpan: 6, styles: { halign: "left" } },
        { content: `Saldo final: ${nf(saldoFinal)} ${un}`, colSpan: 2, styles: { halign: "right", fontStyle: "bold" } },
      ]],
      styles: { fontSize: 7.5, cellPadding: 2, valign: "middle", lineColor: [220, 220, 220], lineWidth: 0.1 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [243, 244, 246], textColor: [31, 41, 55], fontSize: 8 },
      alternateRowStyles: { fillColor: [239, 246, 255] },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 24 },
        2: { cellWidth: 26, halign: "right", fontStyle: "bold" },
        3: { cellWidth: 14, halign: "center" },
        4: { cellWidth: 26, halign: "right" },
        5: { cellWidth: 26, halign: "right", fontStyle: "bold" },
        6: { cellWidth: 22 },
        7: { cellWidth: 22 },
        8: { cellWidth: 18 },
        9: { cellWidth: 20, halign: "center" },
        10: { cellWidth: 20, halign: "center" },
      },
      margin: { left: 14, right: 14 },
      // Pinta tipo/quantidade conforme entrada (verde) / saída (vermelho)
      didParseCell: (data) => {
        if (data.section === "body" && (data.column.index === 1 || data.column.index === 2)) {
          const tipo = ordenadas[data.row.index]?.tipo;
          if (tipo === "ENTRADA")   data.cell.styles.textColor = [5, 150, 105];
          else if (tipo === "SAIDA") data.cell.styles.textColor = [220, 38, 38];
        }
      },
      didDrawPage: (data) => {
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(`${it.codigo} — ${it.descricao}`, 14, pageH - 8);
        doc.text(`Página ${data.pageNumber}`, pageW - 14, pageH - 8, { align: "right" });
        doc.setTextColor(0);
      },
    });

    const slug = it.codigo
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    doc.save(`movimentacoes-${slug || "produto"}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  // Set tab title once item is loaded
  useTabTitle(item?.descricao ?? null);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
  if (!item) return <div className="px-8 pt-8 text-red-500">{error || "Produto não encontrado"}</div>;

  // ── Calculated stock values ───────────────────────────────────────────────
  // O produto é cadastro compartilhado entre as empresas do grupo, então os
  // saldos chegam de todas elas; o filtro de empresa recorta estoque e custos.
  const estoqueComLocalTodas = item.estoqueItems.filter((e) => e.localEstoque !== null);
  const empresasEstoque = Array.from(
    new Map(estoqueComLocalTodas.map((e) => [e.empresaId, e.empresa])).values(),
  );
  const estoqueComLocal = empresaEstoqueId
    ? estoqueComLocalTodas.filter((e) => e.empresaId === empresaEstoqueId)
    : estoqueComLocalTodas;
  const estoqueTotal = estoqueComLocal.reduce((s, e) => s + decimalToNumber(e.quantidadeAtual), 0);
  const estoqueTotalTodas = estoqueComLocalTodas.reduce((s, e) => s + decimalToNumber(e.quantidadeAtual), 0);
  // Custo por empresa: cada empresa do grupo tem o próprio CMPM
  // (ItemCustoEmpresa). ESTRITO por empresa: um item sem entrada com custo na
  // empresa fica SEM custo (0) — nunca herda o custo de outra empresa.
  const custoPorEmpresa = new Map<string, number>(
    (item.custosEmpresa ?? [])
      .filter((c) => c.precoCusto != null)
      .map((c) => [c.empresaId, decimalToNumber(c.precoCusto)]),
  );
  const custoDaEmpresa = (empId: string) => custoPorEmpresa.get(empId) ?? 0;
  // Custo médio exibido: o da empresa filtrada; com uma única empresa visível,
  // o dela; com várias empresas e sem filtro, fica vazio (custos divergem).
  const custoUnit = empresaEstoqueId
    ? custoDaEmpresa(empresaEstoqueId)
    : empresasEstoque.length === 1
      ? custoDaEmpresa(empresasEstoque[0].id)
      : 0;
  // Produto Acabado: custo médio fica em branco (custo virá do PCP); valoração do
  // estoque é pelo PREÇO MÉDIO DE VENDA enquanto isso.
  const ehAcabado = item.categoriaEstoque === "PRODUTO_ACABADO";
  const precoVendaMedioNum = item.precoVendaMedio != null
    ? decimalToNumber(item.precoVendaMedio)
    : (item.precoVenda != null ? decimalToNumber(item.precoVenda) : 0);
  const valorUnitDaEmpresa = (empId: string) => ehAcabado ? precoVendaMedioNum : custoDaEmpresa(empId);
  // Valor total do estoque (base de valoração por categoria).
  const custoTotal = estoqueComLocal.reduce(
    (s, e) => s + decimalToNumber(e.quantidadeAtual) * valorUnitDaEmpresa(e.empresaId),
    0,
  );

  const filtroEmpresaEstoque = empresasEstoque.length > 1 ? (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      Empresa
      <ComboboxWithCreate
        value={empresaEstoqueId}
        onChange={(v) => setEmpresaEstoqueId(v)}
        noneLabel="Todas as empresas"
        triggerClassName="h-8 rounded-lg text-xs"
        options={empresasEstoque.map((emp) => ({ value: emp.id, label: emp.nomeFantasia || emp.razaoSocial }))}
      />
    </label>
  ) : null;
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
    { key: "estoques",       label: "Estoques" },
    { key: "movimentacoes",  label: `Movimentações (${item.movimentacoes?.length ?? 0})` },
    { key: "compras",        label: totalCompras !== null ? `Compras (${totalCompras})` : "Compras" },
    { key: "unidades",       label: `Unidades${itemUnidades.length > 0 ? ` (${itemUnidades.length})` : ""}` },
    { key: "relatorio",      label: "Relatório" },
  ] as const;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Breadcrumb */}
      <div className="px-8 pt-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <span>Suprimentos</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link href="/suprimentos/produtos" className="hover:text-foreground transition-colors">Produtos</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">{item.codigo}</span>
      </div>

      {/* Header */}
      <div className="px-8 pt-2 pb-0 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-info/15 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5 text-info" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground leading-tight">{item.descricao}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-xs text-muted-foreground">{item.codigo}</span>
              <span className="text-muted-foreground/60">·</span>
              <span className="text-xs text-muted-foreground">{TIPO_LABEL[item.tipo] ?? item.tipo}</span>
              <span className="text-muted-foreground/60">·</span>
              <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium",
                item.ativo ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
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
                className="border-amber-300 text-warning hover:bg-warning/10"
              >
                <ClipboardList className="w-4 h-4 mr-1" />
                Nova Necessidade
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={toggleFavorito}
                disabled={favoritoSaving}
                title={item.favorito ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                className={item.favorito ? "border-yellow-400 text-yellow-600 hover:bg-warning/10" : ""}
              >
                <Star className={cn("w-4 h-4", item.favorito ? "fill-yellow-400 text-yellow-500" : "")} />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>
                <Pencil className="w-4 h-4 mr-1" />Editar
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-8 mt-3 bg-danger/10 border border-danger/30 text-danger px-4 py-2 rounded-lg text-sm">{error}</div>
      )}

      {/* Tabs */}
      <div className="px-8 mt-5 border-b border-border">
        <div className="flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                if (t.key === "compras") loadCompras();
                if (t.key === "unidades" && !unidadesLoaded) loadItemUnidades();
              }}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                tab === t.key
                  ? "border-blue-600 text-info"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
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
                      <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted cursor-not-allowed">
                        <span className="font-mono text-sm text-foreground">{item.codigo}</span>
                        <span className="ml-auto text-[10px] font-semibold text-blue-500 bg-info/10 px-1.5 py-0.5 rounded">auto</span>
                      </div>
                    </Field>
                    <Field label="Categoria">
                      <CategoriaEstoqueSelect
                        value={(form.categoriaEstoque as string) || ""}
                        onChange={(v) => setForm((p) => ({ ...p, categoriaEstoque: v || null }))}
                        allowNone
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">Natureza do produto — define em quais locais de estoque ele pode entrar.</p>
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
                      <p className="text-[11px] text-muted-foreground mt-1">Usada para gestão do estoque · configure conversões na aba Unidades</p>
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

                    {/* Vendável — edit */}
                    <div className="md:col-span-2">
                      <label className="flex items-start gap-3 cursor-pointer select-none group">
                        <div className="relative mt-0.5">
                          <input
                            type="checkbox"
                            checked={Boolean(form.vendavel)}
                            onChange={(e) => setForm((p) => ({ ...p, vendavel: e.target.checked }))}
                            className="sr-only peer"
                          />
                          <div className="w-5 h-5 rounded border-2 border-border bg-card peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-colors group-hover:border-blue-400 flex items-center justify-center">
                            {Boolean(form.vendavel) && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">Este produto é vendável</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Pode ser incluído em Pedidos de Venda.</p>
                        </div>
                      </label>
                    </div>

                    {/* Comodato — edit */}
                    <div className="md:col-span-2">
                      <label className="flex items-start gap-3 cursor-pointer select-none group">
                        <div className="relative mt-0.5">
                          <input
                            type="checkbox"
                            checked={Boolean(form.comodato)}
                            onChange={(e) => setForm((p) => ({ ...p, comodato: e.target.checked }))}
                            className="sr-only peer"
                          />
                          <div className="w-5 h-5 rounded border-2 border-border bg-card peer-checked:bg-orange-500 peer-checked:border-orange-500 transition-colors group-hover:border-orange-400 flex items-center justify-center">
                            {Boolean(form.comodato) && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">Item de comodato (vasilhame retornável)</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Pallets, engradados e outros itens emprestados ao cliente. Aparece na tela de Comodato.</p>
                        </div>
                      </label>
                    </div>

                    {/* Consumível — edit */}
                    <div className="md:col-span-2">
                      <label className="flex items-start gap-3 cursor-pointer select-none group">
                        <div className="relative mt-0.5">
                          <input
                            type="checkbox"
                            checked={form.consumivel !== false}
                            onChange={(e) => setForm((p) => ({ ...p, consumivel: e.target.checked }))}
                            className="sr-only peer"
                          />
                          <div className="w-5 h-5 rounded border-2 border-border bg-card peer-checked:bg-cyan-500 peer-checked:border-cyan-500 transition-colors group-hover:border-cyan-400 flex items-center justify-center">
                            {form.consumivel !== false && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">Item consumível</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Marcado: dá baixa no estoque ao ser consumido. Desmarcado: item permanente (ex.: ferramentas), requisitado e devolvido ao almoxarifado.</p>
                        </div>
                      </label>
                    </div>
                  </>
                ) : (
                  <>
                    <Info label="Código" value={item.codigo} mono />
                    <Info label="Categoria" value={item.categoriaEstoque ? rotuloCategoria(item.categoriaEstoque) : undefined} />
                    <Info label="Descrição" value={item.descricao} colSpan />

                    {/* Unidade de Estoque — campo rico com referência às conversões */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Unidade de Estoque</p>
                      {item.unidade ? (
                        <div className="flex items-start justify-between gap-3 rounded-lg border border-info/20 bg-info/10 px-3 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="font-mono text-sm font-bold text-info bg-info/15 px-2 py-0.5 rounded shrink-0">
                              {item.unidade.sigla}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground leading-tight">{item.unidade.nome}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Unidade base · gestão de estoque e movimentações
                              </p>
                            </div>
                          </div>
                          {itemUnidades.filter((iu) => iu.unidade.id !== item.unidade?.id).length > 0 && (
                            <span className="shrink-0 text-[11px] text-blue-500 font-medium whitespace-nowrap mt-0.5">
                              {itemUnidades.filter((iu) => iu.unidade.id !== item.unidade?.id).length} conversão(ões)
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded">UN</span>
                            <p className="text-xs text-muted-foreground">Padrão (sem unidade definida)</p>
                          </div>
                          <button
                            onClick={() => setEditMode(true)}
                            className="text-[11px] text-blue-500 hover:text-info underline underline-offset-2 transition-colors whitespace-nowrap"
                          >
                            Definir →
                          </button>
                        </div>
                      )}
                      {unidadesLoaded && itemUnidades.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {itemUnidades
                            .filter((iu) => iu.unidade.id !== item.unidade?.id)
                            .slice(0, 4)
                            .map((iu) => (
                              <span key={iu.id} className="inline-flex items-center gap-1 text-[11px] font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                                <span className="font-mono">{iu.unidade.sigla}</span>
                                {iu.fatorConversao && (
                                  <span className="text-muted-foreground">
                                    = {Number(iu.fatorConversao).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}{" "}
                                    {iu.baseUnidade?.sigla ?? item.unidade?.sigla}
                                  </span>
                                )}
                              </span>
                            ))}
                          {itemUnidades.filter((iu) => iu.unidade.id !== item.unidade?.id).length > 4 && (
                            <span className="text-[11px] text-muted-foreground">
                              +{itemUnidades.filter((iu) => iu.unidade.id !== item.unidade?.id).length - 4} mais
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <Info label="NCM" value={item.ncm} />
                    {/* Vendável — view */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Vendável</p>
                      <span className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full",
                        item.vendavel
                          ? "bg-success/15 text-success"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {item.vendavel ? (
                          <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Sim — disponível para venda</>
                        ) : (
                          <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>Não vendável</>
                        )}
                      </span>
                    </div>
                    {/* Comodato — view */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Comodato</p>
                      <span className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full",
                        item.comodato
                          ? "bg-warning/15 text-warning"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {item.comodato ? (
                          <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Sim — vasilhame retornável</>
                        ) : (
                          <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>Não é comodato</>
                        )}
                      </span>
                    </div>
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
                    <p className="text-xs font-medium text-muted-foreground">Custo Médio</p>
                    <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted cursor-not-allowed">
                      <span className="text-sm text-foreground">
                        {custoUnit > 0 ? formatBRL(custoUnit) : "—"}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">auto · entradas</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Calculado automaticamente via CMPM. Informe o custo ao registrar entradas.
                    </p>
                  </div>
                  <Field label="Custo Médio (R$)">
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
                  {filtroEmpresaEstoque && (
                    <div className="col-span-2 sm:col-span-4 flex justify-end -mb-2">{filtroEmpresaEstoque}</div>
                  )}
                  {/* Custo Médio (acabado: preço médio de venda) */}
                  <div className="rounded-xl bg-muted px-4 py-3">
                    <p className="text-xs text-muted-foreground font-medium mb-1">{ehAcabado ? "Preço méd. de venda" : "Custo Médio"}</p>
                    <p className="text-xl font-bold text-foreground">
                      {ehAcabado ? (precoVendaMedioNum > 0 ? formatBRL(precoVendaMedioNum) : "—") : (custoUnit > 0 ? formatBRL(custoUnit) : "—")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ehAcabado ? "custo de produção: a definir (PCP)" : (custoUnit > 0 ? "CMPM por entradas" : "")}
                    </p>
                  </div>
                  {/* Valor Total em Estoque */}
                  <div className="rounded-xl bg-info/10 px-4 py-3">
                    <p className="text-xs text-info font-medium mb-1">{ehAcabado ? "Valor em Estoque (venda)" : "Custo Total em Estoque"}</p>
                    <p className="text-xl font-bold text-info">
                      {custoTotal > 0 ? formatBRL(custoTotal) : "—"}
                    </p>
                    {custoTotal > 0 && (
                      <p className="text-xs text-blue-500 mt-0.5">
                        {estoqueTotal.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.unidade?.sigla || item.unidadeMedida}
                      </p>
                    )}
                  </div>
                  {/* Custo Médio */}
                  <div className="rounded-xl bg-violet-50 dark:bg-violet-500/15 px-4 py-3">
                    <p className="text-xs text-violet-600 dark:text-violet-400 font-medium mb-1">Custo Médio</p>
                    <p className="text-xl font-bold text-violet-800 dark:text-violet-300">
                      {custoMedio > 0 ? formatBRL(custoMedio) : "—"}
                    </p>
                    {item.fornecedores.filter((f) => decimalToNumber(f.precoUltimo) > 0).length > 0 && (
                      <p className="text-xs text-violet-400 mt-0.5">média dos fornecedores</p>
                    )}
                  </div>
                  {/* Custo Médio */}
                  <div className="rounded-xl bg-success/10 px-4 py-3">
                    <p className="text-xs text-success font-medium mb-1">Custo Médio</p>
                    <p className="text-xl font-bold text-success">
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
                <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-md space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground text-base">Vincular Fornecedor</h3>
                    <button type="button" onClick={() => setShowAddForn(false)} className="text-muted-foreground hover:text-muted-foreground transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-4">
                    {addFornError && (
                      <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">{addFornError}</p>
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
              <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
                <p className="text-sm">Nenhum fornecedor vinculado a este produto</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold">Fornecedor</th>
                      <th className="text-left px-4 py-3 font-semibold">Cód. Fornecedor</th>
                      <th className="text-right px-4 py-3 font-semibold">Último Preço</th>
                      <th className="text-right px-4 py-3 font-semibold">Prazo (dias)</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {item.fornecedores.map((pf) => (
                      <tr key={pf.id} className="hover:bg-info/10">
                        <td className="px-4 py-3 font-medium text-foreground">
                          <Link href={`/suprimentos/fornecedores/${pf.fornecedor.id}`} className="hover:text-info hover:underline">
                            {pf.fornecedor.nomeFantasia || pf.fornecedor.razaoSocial}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{pf.codigoFornecedor || "—"}</td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">{pf.precoUltimo ? formatBRL(decimalToNumber(pf.precoUltimo)) : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-3 text-right text-foreground font-semibold">{pf.prazoEntregaDias ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-red-500" onClick={() => removeFornecedor(pf.id)}>
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

        {/* ── ESTOQUES ────────────────────────────────────────────────────── */}
        {tab === "estoques" && (
          <div className="space-y-4">
            {item.tipo === "SERVICO" ? (
              <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
                <p className="text-sm">Serviços não possuem controle de estoque</p>
              </div>
            ) : (
              <>
                {/* Header bar */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Saldo por local de estoque ·{" "}
                    <span className="font-semibold text-foreground">
                      {estoqueTotal.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.unidade?.sigla || item.unidadeMedida}
                    </span>
                    {itemUnidades.filter((iu) => !iu.isPrincipal && iu.fatorConversao).map((iu) => (
                      <span key={iu.id} className="text-muted-foreground">
                        {" · "}
                        <span className="font-semibold text-muted-foreground">
                          {(estoqueTotal / Number(iu.fatorConversao)).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {iu.unidade.sigla}
                        </span>
                      </span>
                    ))}{" "}
                    total
                    {custoUnit > 0 && (
                      <> · custo total{" "}
                        <span className="font-semibold text-info">{formatBRL(custoTotal)}</span>
                      </>
                    )}
                  </p>
                  <div className="flex items-center gap-3">
                    {filtroEmpresaEstoque}
                    <Button size="sm" onClick={openSaldoDialog}>
                      <Plus className="w-4 h-4 mr-1" />Inserir Saldo
                    </Button>
                  </div>
                </div>

                {estoqueComLocal.length === 0 ? (
                  <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">
                    <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">Nenhum saldo registrado em local definido</p>
                    <p className="text-xs mt-1">Use &quot;Inserir Saldo&quot; para itens já em estoque</p>
                    <Button size="sm" variant="outline" className="mt-4" onClick={openSaldoDialog}>
                      <Plus className="w-3.5 h-3.5 mr-1" />Inserir Saldo
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted border-b-2 border-border text-xs text-muted-foreground uppercase tracking-wide">
                          <tr>
                            <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Filial</th>
                            <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Local de Estoque</th>
                            <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">Saldo</th>
                            <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">Saldo Disponível</th>
                            <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">Custo Unit.</th>
                            <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">Custo Médio</th>
                            <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">Custo Total</th>
                            <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Endereço</th>
                            {isAdmin && <th className="w-20 px-4 py-3" />}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {estoqueComLocal.map((e) => {
                            const atual = decimalToNumber(e.quantidadeAtual);
                            const min = decimalToNumber(e.quantidadeMin);
                            const abaixo = min > 0 && atual < min;
                            const custoLinha = custoDaEmpresa(e.empresaId);
                            const custoTotalLinha = custoLinha * atual;
                            const filialNome = e.localEstoque?.filial
                              ? (e.localEstoque.filial.nomeFantasia || e.localEstoque.filial.razaoSocial)
                              : "—";
                            const isEditingRow = editingEstoqueId === e.id;
                            return (
                              <tr key={e.id} className={cn("hover:bg-indigo-50/40 transition-colors", abaixo && "bg-danger/10", isEditingRow && "bg-warning/10 hover:bg-warning/10")}>
                                <td className="px-4 py-3.5 text-foreground text-xs font-semibold">
                                  {empresasEstoque.length > 1 && (
                                    <span className="block text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">
                                      {e.empresa.nomeFantasia || e.empresa.razaoSocial}
                                    </span>
                                  )}
                                  {filialNome}
                                </td>
                                <td className="px-4 py-3.5 font-medium text-foreground">
                                  <Link href={`/suprimentos/locais-estoque/${e.localEstoque!.id}`} className="hover:text-info hover:underline">
                                    {e.localEstoque!.nome}
                                  </Link>
                                </td>

                                {/* Saldo */}
                                <td className="px-4 py-3.5 text-right">
                                  {isEditingRow ? (
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.001"
                                      className="h-7 w-28 text-right text-xs ml-auto"
                                      value={estoqueEditForm.quantidadeAtual}
                                      onChange={(ev) => setEstoqueEditForm((f) => ({ ...f, quantidadeAtual: ev.target.value }))}
                                      autoFocus
                                    />
                                  ) : (
                                    <div className="flex flex-col items-end gap-0.5">
                                      <div>
                                        <span className={cn("font-bold", abaixo ? "text-danger" : "text-foreground")}>
                                          {atual.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                                        </span>
                                        <span className="text-xs text-muted-foreground font-medium ml-1">{item.unidade?.sigla || item.unidadeMedida}</span>
                                      </div>
                                      {itemUnidades.filter((iu) => !iu.isPrincipal && iu.fatorConversao).map((iu) => (
                                        <div key={iu.id} className="text-xs text-muted-foreground font-medium">
                                          {(atual / Number(iu.fatorConversao)).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                                          <span className="ml-1">{iu.unidade.sigla}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>

                                <td className="px-4 py-3.5 text-right">
                                  <div className="flex flex-col items-end gap-0.5">
                                    <div>
                                      <span className="font-semibold text-foreground">
                                        {atual.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                                      </span>
                                      <span className="text-xs text-muted-foreground font-medium ml-1">{item.unidade?.sigla || item.unidadeMedida}</span>
                                    </div>
                                    {itemUnidades.filter((iu) => !iu.isPrincipal && iu.fatorConversao).map((iu) => (
                                      <div key={iu.id} className="text-xs text-muted-foreground font-medium">
                                        {(atual / Number(iu.fatorConversao)).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                                        <span className="ml-1">{iu.unidade.sigla}</span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-right font-semibold text-foreground">
                                  {custoLinha > 0 ? formatBRL(custoLinha) : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-4 py-3.5 text-right text-muted-foreground text-xs">
                                  {custoLinha > 0 ? (
                                    <span className="font-mono bg-violet-100 dark:bg-violet-500/25 text-violet-800 dark:text-violet-300 border border-violet-200 dark:border-violet-500/30 px-1.5 py-0.5 rounded">{formatBRL(custoLinha)}</span>
                                  ) : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-4 py-3.5 text-right font-semibold text-info">
                                  {custoTotalLinha > 0 ? formatBRL(custoTotalLinha) : <span className="text-muted-foreground font-normal">—</span>}
                                </td>

                                {/* Endereço */}
                                <td className="px-4 py-3.5 text-muted-foreground text-xs">
                                  {isEditingRow ? (
                                    <Input
                                      className="h-7 w-28 text-xs font-mono"
                                      placeholder="Ex: A-01-02"
                                      value={estoqueEditForm.localizacao}
                                      onChange={(ev) => setEstoqueEditForm((f) => ({ ...f, localizacao: ev.target.value }))}
                                    />
                                  ) : e.localizacao ? (
                                    <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{e.localizacao}</span>
                                  ) : "—"}
                                </td>

                                {/* Admin actions */}
                                {isAdmin && (
                                  <td className="px-3 py-3.5">
                                    {isEditingRow ? (
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={saveEstoqueEdit}
                                          disabled={estoqueEditSaving}
                                          className="p-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50"
                                          title="Salvar"
                                        >
                                          {estoqueEditSaving
                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            : <Save className="w-3.5 h-3.5" />}
                                        </button>
                                        <button
                                          onClick={() => { setEditingEstoqueId(null); setEstoqueEditError(""); }}
                                          className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                                          title="Cancelar"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => openEstoqueEdit(e)}
                                        className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-indigo-600 dark:text-indigo-400 transition-colors"
                                        title="Editar registro"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                        {estoqueComLocal.length > 1 && (
                          <tfoot>
                            <tr className="border-t-2 border-border bg-muted">
                              <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Total</td>
                              <td className="px-4 py-2.5 text-right font-bold text-foreground">
                                {estoqueTotal.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                                <span className="text-xs font-normal text-muted-foreground ml-1">{item.unidade?.sigla || item.unidadeMedida}</span>
                              </td>
                              <td className="px-4 py-2.5 text-right font-bold text-foreground">
                                {estoqueTotal.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                                <span className="text-xs font-normal text-muted-foreground ml-1">{item.unidade?.sigla || item.unidadeMedida}</span>
                              </td>
                              <td colSpan={2} />
                              <td className="px-4 py-2.5 text-right font-bold text-info">
                                {custoTotal > 0 ? formatBRL(custoTotal) : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td colSpan={isAdmin ? 2 : 1} />
                            </tr>
                          </tfoot>
                        )}
                        {estoqueEditError && (
                          <tfoot>
                            <tr>
                              <td colSpan={isAdmin ? 9 : 8} className="px-4 py-2 text-xs text-danger bg-danger/10">
                                {estoqueEditError}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Parâmetros de Reposição */}
            {item.tipo !== "SERVICO" && (
              <div className="rounded-xl border border-border bg-muted/60 p-4 mt-2">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">Parâmetros de Reposição</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {([
                    { field: "estoqueMinimo",  label: "Estoque Mínimo (EDS)", suffix: item.unidade?.sigla || item.unidadeMedida },
                    { field: "estoqueMaximo",  label: "Estoque Máximo (EMax)", suffix: item.unidade?.sigla || item.unidadeMedida },
                    { field: "pontoReposicao", label: "Ponto de Reposição (PR)", suffix: item.unidade?.sigla || item.unidadeMedida },
                    { field: "leadTimeDias",   label: "Lead Time", suffix: "dias" },
                  ] as const).map(({ field, label, suffix }) => {
                    const rawVal = item[field];
                    const displayVal = rawVal != null
                      ? (field === "leadTimeDias"
                          ? `${rawVal} ${suffix}`
                          : `${decimalToNumber(rawVal).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${suffix}`)
                      : null;
                    const isEditing = paramEdit === field;
                    return (
                      <div key={field} className="bg-card rounded-lg border border-border px-3 py-2.5">
                        <p className="text-xs text-muted-foreground font-medium mb-1">{label}</p>
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <Input
                              autoFocus
                              type="number"
                              min="0"
                              value={paramValue}
                              onChange={(e) => setParamValue(e.target.value)}
                              className="h-7 text-sm w-full"
                              onKeyDown={(e) => { if (e.key === "Enter") saveParam(field, paramValue); if (e.key === "Escape") setParamEdit(null); }}
                            />
                            <button
                              onClick={() => saveParam(field, paramValue)}
                              disabled={paramSaving}
                              className="p-1 rounded hover:bg-success/10 text-success disabled:opacity-50"
                            >
                              {paramSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => setParamEdit(null)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-1">
                            <span className={cn("text-sm font-semibold", displayVal ? "text-foreground" : "text-muted-foreground font-normal italic")}>
                              {displayVal ?? "Não definido"}
                            </span>
                            <button
                              onClick={() => {
                                setParamEdit(field);
                                const v = rawVal != null ? (field === "leadTimeDias" ? String(rawVal) : decimalToNumber(rawVal).toString()) : "";
                                setParamValue(v);
                              }}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-muted-foreground"
                              title="Editar"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MOVIMENTAÇÕES ───────────────────────────────────────────────── */}
        {tab === "movimentacoes" && (() => {
          // ── Period filter ──────────────────────────────────────────────
          const inicio = movPeriodo.from ? new Date(movPeriodo.from + "T00:00:00") : null;
          const fim    = movPeriodo.to   ? new Date(movPeriodo.to   + "T23:59:59") : null;
          const movsVisiveis = item.movimentacoes.filter((m) => {
            const d = new Date(m.lote?.dataMovimentacao ?? m.createdAt);
            if (inicio && d < inicio) return false;
            if (fim    && d > fim)    return false;
            if (movLocalFilter && (m.localEstoqueId ?? m.localEstoque?.id ?? "") !== movLocalFilter) return false;
            if (movTipoFilter && m.tipo !== movTipoFilter) return false;
            return true;
          });
          const temFiltro = !!movPeriodo.from || !!movPeriodo.to || !!movLocalFilter || !!movTipoFilter;
          // Locais de estoque presentes nas movimentações (para o filtro).
          const locaisMov = Array.from(
            new Map(
              item.movimentacoes
                .filter((m) => m.localEstoque)
                .map((m) => [m.localEstoque!.id, m.localEstoque!.nome] as const),
            ).entries(),
          ).sort((a, b) => a[1].localeCompare(b[1]));

          return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Histórico de movimentações deste produto</p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadMovimentacoes(movsVisiveis, movPeriodo)}
                  disabled={movsVisiveis.length === 0}
                  className="text-info hover:bg-info/10 border-info/30"
                >
                  <Printer className="w-4 h-4 mr-1.5" />
                  Baixar PDF
                </Button>
                <Button size="sm" onClick={openMovDialog}>
                  <ArrowUpDown className="w-4 h-4 mr-1.5" />
                  Nova Movimentação
                </Button>
              </div>
            </div>

            {/* Filtros: período, local de estoque e tipo */}
            <div className="flex items-center gap-3 flex-wrap">
              <DateRangePicker
                value={movPeriodo}
                onChange={setMovPeriodo}
                placeholder="Filtrar por período..."
              />
              <select
                value={movLocalFilter}
                onChange={(e) => setMovLocalFilter(e.target.value)}
                className="h-9 rounded-lg border border-border px-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos os locais</option>
                {locaisMov.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
              </select>
              <select
                value={movTipoFilter}
                onChange={(e) => setMovTipoFilter(e.target.value as "" | "ENTRADA" | "SAIDA")}
                className="h-9 rounded-lg border border-border px-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Entradas e saídas</option>
                <option value="ENTRADA">Só entradas</option>
                <option value="SAIDA">Só saídas</option>
              </select>
              {temFiltro && (
                <>
                  <button
                    onClick={() => { setMovPeriodo({ from: "", to: "" }); setMovLocalFilter(""); setMovTipoFilter(""); }}
                    className="text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
                  >
                    Limpar
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {movsVisiveis.length} de {item.movimentacoes.length} movimentaç{movsVisiveis.length !== 1 ? "ões" : "ão"}
                  </span>
                </>
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
                  <div className="rounded-xl bg-success/10 px-4 py-3 flex items-center gap-3">
                    <TrendingUp className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-xs text-success font-medium">Total Entradas</p>
                      <p className="text-xl font-bold text-success">
                        {totalEntrada.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-danger/10 px-4 py-3 flex items-center gap-3">
                    <TrendingDown className="w-5 h-5 text-red-500 shrink-0" />
                    <div>
                      <p className="text-xs text-danger font-medium">Total Saídas</p>
                      <p className="text-xl font-bold text-danger">
                        {totalSaida.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-info/10 px-4 py-3 flex items-center gap-3">
                    <ArrowUpDown className="w-5 h-5 text-blue-500 shrink-0" />
                    <div>
                      <p className="text-xs text-info font-medium">Movimentações</p>
                      <p className="text-xl font-bold text-info">{movsVisiveis.length}</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {movsVisiveis.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
                <ArrowUpDown className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">
                  {temFiltro ? "Nenhuma movimentação no período selecionado" : "Nenhuma movimentação registrada"}
                </p>
                <p className="text-sm mt-1">
                  {temFiltro ? "Tente ajustar as datas do filtro." : "As movimentações são geradas automaticamente."}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold">Data</th>
                      <th className="text-center px-4 py-3 font-semibold">Tipo</th>
                      <th className="text-right px-4 py-3 font-semibold">Quantidade</th>
                      <th className="text-left px-4 py-3 font-semibold">Unidade</th>
                      <th className="text-right px-4 py-3 font-semibold">Saldo Antes</th>
                      <th className="text-right px-4 py-3 font-semibold">Saldo Depois</th>
                      <th className="text-left px-4 py-3 font-semibold">Origem</th>
                      <th className="text-left px-4 py-3 font-semibold">Documento</th>
                      <th className="text-left px-4 py-3 font-semibold">Minuta Física</th>
                      <th className="text-left px-4 py-3 font-semibold">Obs.</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {movsVisiveis.map((m) => (
                      <tr key={m.id} className="hover:bg-info/10 group/row">
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                          {formatDateTime(m.lote?.dataMovimentacao ?? m.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                            TIPO_MOV_COLOR[m.tipo] ?? "text-muted-foreground bg-muted"
                          )}>
                            {m.tipo === "ENTRADA" && <TrendingUp className="w-3 h-3 mr-1" />}
                            {m.tipo === "SAIDA" && <TrendingDown className="w-3 h-3 mr-1" />}
                            {m.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          <span className={m.tipo === "SAIDA" ? "text-danger" : "text-success"}>
                            {m.tipo === "SAIDA" ? "−" : "+"}{decimalToNumber(m.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {m.unidade
                            ? <span className="font-mono text-xs bg-info/10 text-info px-1.5 py-0.5 rounded">{m.unidade.sigla}</span>
                            : <span className="font-mono text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{item.unidade?.sigla || item.unidadeMedida}</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {decimalToNumber(m.saldoAntes).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-foreground">
                          {decimalToNumber(m.saldoDepois).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-4 py-3">
                          {(m.pedidoVendaItemId || m.conferenciaItemId) ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
                              <RefreshCw className="w-3 h-3" />Automática
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                              Manual
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {m.documento || "—"}
                        </td>
                        <td className="px-4 py-3 text-foreground font-mono text-xs">
                          {m.minutaFisica || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs max-w-[140px] truncate">
                          {m.observacoes || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end opacity-0 group-hover/row:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                if (m.documento === "SALDO-INICIAL" && !m.pedidoVendaItemId && !m.conferenciaItemId) {
                                  openEditSaldoDialog(m);
                                } else {
                                  (() => {
                                    // Reverse-convert qty to selected unit for display
                                    const selIU = m.unidade ? itemUnidades.find((iu) => iu.unidade.id === m.unidade!.id) : null;
                                    const fator = selIU && !selIU.isPrincipal && selIU.fatorConversao ? Number(selIU.fatorConversao) : 1;
                                    const qtdBase = parseFloat(String(m.quantidade));
                                    const qtdDisplay = fator !== 1 ? (qtdBase / fator) : qtdBase;
                                    const movDate = m.lote?.dataMovimentacao
                                      ? new Date(m.lote.dataMovimentacao)
                                      : new Date(m.createdAt);
                                    const localDT = new Date(movDate.getTime() - movDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                                    setEditMov({
                                      id: m.id,
                                      tipo: m.tipo,
                                      localEstoqueNome: m.localEstoque?.nome ?? "",
                                      unidadeId: m.unidade?.id ?? "",
                                      quantidade: qtdDisplay.toLocaleString("en-US", { maximumFractionDigits: 3, useGrouping: false }),
                                      valorUnitario: m.valorUnitario ? String(parseFloat(String(m.valorUnitario))) : "",
                                      documento: m.documento ?? "",
                                      observacoes: m.observacoes ?? "",
                                      dataMovimentacao: localDT,
                                    });
                                  })()
                                }
                              }}
                              className="p-1 rounded text-muted-foreground hover:text-info hover:bg-info/10 transition-colors"
                              title="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteMovConfirm(m)}
                              className="p-1 rounded text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
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
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/60" /></div>
            ) : !compras ? null : (
              <>
                {/* ── Necessidades ── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-amber-500" />
                      Necessidades de Compra
                      <span className="text-xs font-normal text-muted-foreground">({compras.necessidades.length})</span>
                    </h3>
                    <Button size="sm" variant="outline"
                      className="border-amber-300 text-warning hover:bg-warning/10"
                      onClick={() => { setShowNecessidade(true); setNecForm({ quantidade: "", dataNecessidade: "", observacao: "", solicitante: "" }); setNecError(""); }}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Nova Necessidade
                    </Button>
                  </div>
                  {compras.necessidades.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-xl text-sm">
                      Nenhuma necessidade de compra registrada para este produto
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
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
                        <tbody className="divide-y divide-border">
                          {compras.necessidades.map((n) => (
                            <tr key={n.id} className="hover:bg-info/10">
                              <td className="px-4 py-3 font-mono text-xs font-bold text-info">{n.numero}</td>
                              <td className="px-4 py-3">
                                <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold", {
                                  "bg-muted text-muted-foreground":   n.status === "RASCUNHO",
                                  "bg-warning/15 text-warning": n.status === "PENDENTE",
                                  "bg-info/15 text-info":   n.status === "APROVADO",
                                  "bg-success/15 text-success": n.status === "CONCLUIDO",
                                  "bg-danger/15 text-danger":     n.status === "REPROVADO" || n.status === "CANCELADO",
                                })}>
                                  {n.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-foreground">
                                {decimalToNumber(n.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                              </td>
                              <td className="px-4 py-3 text-foreground text-xs">{n.solicitante || <span className="text-muted-foreground">—</span>}</td>
                              <td className="px-4 py-3 text-muted-foreground text-xs">
                                {n.dataNecessidade ? new Date(n.dataNecessidade).toLocaleDateString("pt-BR") : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                                {new Date(n.createdAt).toLocaleDateString("pt-BR")}
                              </td>
                              <td className="px-3 py-3">
                                <Link href={`/compras/necessidades/${n.id}`} className="p-1 rounded hover:bg-info/10 text-muted-foreground hover:text-info inline-flex">
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
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-500" />
                    Pedidos de Compra
                    <span className="text-xs font-normal text-muted-foreground">({compras.pedidos.length})</span>
                  </h3>
                  {compras.pedidos.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-xl text-sm">
                      Nenhum pedido de compra para este produto
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
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
                        <tbody className="divide-y divide-border">
                          {compras.pedidos.map((p) => (
                            <tr key={p.id} className="hover:bg-info/10">
                              <td className="px-4 py-3 font-mono text-xs font-bold text-info">{p.numero}</td>
                              <td className="px-4 py-3">
                                <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold", {
                                  "bg-muted text-muted-foreground":   p.status === "RASCUNHO",
                                  "bg-warning/15 text-warning": p.status === "ENVIADO",
                                  "bg-info/15 text-info":   p.status === "CONFIRMADO",
                                  "bg-success/15 text-success": p.status === "ENTREGUE",
                                  "bg-danger/15 text-danger":     p.status === "CANCELADO",
                                })}>
                                  {p.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-foreground text-xs font-medium">
                                {p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-foreground">
                                {decimalToNumber(p.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                              </td>
                              <td className="px-4 py-3 text-right text-foreground font-semibold">
                                {formatBRL(decimalToNumber(p.precoUnitario))}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground text-xs">
                                {p.dataEntregaPrevista ? new Date(p.dataEntregaPrevista).toLocaleDateString("pt-BR") : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="px-3 py-3">
                                <Link href={`/suprimentos/pedidos-compra/${p.id}`} className="p-1 rounded hover:bg-info/10 text-muted-foreground hover:text-info inline-flex">
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
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <PackageCheck className="w-4 h-4 text-emerald-500" />
                    Conferências de Recebimento
                    <span className="text-xs font-normal text-muted-foreground">({compras.conferencias.length})</span>
                  </h3>
                  {compras.conferencias.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-xl text-sm">
                      Nenhuma conferência de recebimento para este produto
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
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
                        <tbody className="divide-y divide-border">
                          {compras.conferencias.map((c) => (
                            <tr key={c.id} className="hover:bg-info/10">
                              <td className="px-4 py-3 font-mono text-xs font-bold text-info">{c.numero}</td>
                              <td className="px-4 py-3">
                                <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold", {
                                  "bg-warning/15 text-warning": c.status === "PENDENTE",
                                  "bg-info/15 text-info":   c.status === "EM_ANDAMENTO",
                                  "bg-success/15 text-success": c.status === "CONCLUIDA",
                                  "bg-danger/15 text-danger":     c.status === "CANCELADA",
                                })}>
                                  {c.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">
                                {c.pedido ? c.pedido.numero : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="px-4 py-3 text-foreground text-xs font-medium">
                                {c.pedido
                                  ? (c.pedido.fornecedor.nomeFantasia || c.pedido.fornecedor.razaoSocial)
                                  : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-foreground">
                                {decimalToNumber(c.quantidadePedida).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-success">
                                {decimalToNumber(c.quantidadeRecebida).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {c.divergencia
                                  ? <span className="text-xs text-danger font-semibold bg-danger/15 border border-danger/30 px-2.5 py-1 rounded-full">Sim</span>
                                  : <span className="text-xs text-success font-semibold bg-success/15 border border-success/30 px-2.5 py-1 rounded-full">OK</span>
                                }
                              </td>
                              <td className="px-3 py-3">
                                <Link href={`/suprimentos/conferencias/${c.id}`} className="p-1 rounded hover:bg-info/10 text-muted-foreground hover:text-info inline-flex">
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

          const movPeriodo  = item.movimentacoes.filter((m) => new Date(m.lote?.dataMovimentacao ?? m.createdAt) >= corte);
          const saidasPer   = movPeriodo.filter((m) => m.tipo === "SAIDA");
          const entradasPer = movPeriodo.filter((m) => m.tipo === "ENTRADA");

          const totalSaidaPer    = saidasPer.reduce((s, m) => s + decimalToNumber(m.quantidade), 0);
          const totalEntradaPer  = entradasPer.reduce((s, m) => s + decimalToNumber(m.quantidade), 0);
          const mesesPeriodo     = periodoDias / 30;

          // Consumo Médio Mensal
          const consumoMedioMensal = mesesPeriodo > 0 ? totalSaidaPer / mesesPeriodo : 0;
          const consumoDiario      = periodoDias > 0   ? totalSaidaPer / periodoDias   : 0;

          // Giro de Estoque (anualizado) — as movimentações vêm de todas as
          // empresas, então o relatório usa o estoque total sem filtro.
          const giro = estoqueTotalTodas > 0 ? (totalSaidaPer * (365 / periodoDias)) / estoqueTotalTodas : 0;

          // Cobertura de Estoque em dias
          const coberturaDias = consumoDiario > 0 ? estoqueTotalTodas / consumoDiario : Infinity;

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
                <span className="text-xs text-muted-foreground font-medium">Período de análise:</span>
                {([30, 90, 180, 365] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setPeriodoDias(d)}
                    className={cn(
                      "px-3 py-1 text-xs font-medium rounded-full border transition-colors",
                      periodoDias === d
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-border text-muted-foreground hover:border-border"
                    )}
                  >
                    {d === 365 ? "1 ano" : `${d} dias`}
                  </button>
                ))}
                <span className="text-xs text-muted-foreground ml-2">
                  ({saidasPer.length} saídas · {entradasPer.length} entradas no período)
                </span>
              </div>

              {semDados && (
                <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
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
                    <div className="rounded-xl border border-border bg-muted px-5 py-4 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resumo do Período</p>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Entradas</span>
                        <span className="font-semibold text-success">+{totalEntradaPer.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {sigla}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Saídas</span>
                        <span className="font-semibold text-danger">−{totalSaidaPer.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {sigla}</span>
                      </div>
                      <div className="flex justify-between text-sm border-t border-border pt-2">
                        <span className="text-muted-foreground">Estoque Atual</span>
                        <span className="font-bold text-foreground">{estoqueTotalTodas.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {sigla}</span>
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
                      <div className="rounded-xl border border-border bg-card px-5 py-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Movimentação Mensal — últimos 12 meses</p>
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
                              <span className="text-[9px] text-muted-foreground rotate-45 origin-left mt-1 whitespace-nowrap">{m.label}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-4 mt-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-200 inline-block" />Entradas</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-200 inline-block" />Saídas</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Evolução do Saldo (consumo analysis chart) ──────────── */}
                  {(() => {
                    const pr   = item.pontoReposicao != null ? decimalToNumber(item.pontoReposicao) : consumoDiario * (item.leadTimeDias ?? 7);
                    const eds  = item.estoqueMinimo  != null ? decimalToNumber(item.estoqueMinimo)  : consumoDiario * 3;
                    const emax = item.estoqueMaximo  != null ? decimalToNumber(item.estoqueMaximo)  : null;

                    let previsaoText  = "—";
                    let previsaoCls   = "bg-muted text-muted-foreground";
                    if (consumoDiario > 0) {
                      if (estoqueTotalTodas <= eds) {
                        previsaoText = "CRÍTICO";
                        previsaoCls  = "bg-danger/15 text-danger";
                      } else {
                        const dias  = Math.floor(estoqueTotalTodas / consumoDiario);
                        const lead  = item.leadTimeDias ?? 7;
                        const dtStr = new Date(Date.now() + dias * 86400000)
                          .toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" });
                        previsaoText = `${dias}d (${dtStr})`;
                        previsaoCls  = dias <= lead ? "bg-danger/15 text-danger"
                          : dias <= lead * 2 ? "bg-warning/15 text-warning"
                          : "bg-success/15 text-success";
                      }
                    }

                    return (
                      <div className="rounded-xl border border-border bg-card px-5 py-4 space-y-4">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-info" />
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              Evolução do Saldo — Últimos 90 dias + Projeção 14 dias
                            </p>
                          </div>
                          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", previsaoCls)}>
                            Ruptura: {previsaoText}
                          </span>
                        </div>

                        {/* Parameters row */}
                        <div className="flex flex-wrap gap-3">
                          <ParamBadge label="Pto. Reposição" value={`${pr.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${sigla}`} color="amber" />
                          <ParamBadge label="Est. Mínimo (EDS)" value={`${eds.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${sigla}`} color="red" />
                          {emax != null && (
                            <ParamBadge label="Est. Máximo" value={`${emax.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${sigla}`} color="gray" />
                          )}
                          <ParamBadge label="Lead Time" value={`${item.leadTimeDias ?? 7} dias`} color="gray" />
                        </div>

                        {/* Chart image */}
                        <ConsumoChart itemId={id} />
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          );
        })()}

        {/* ── UNIDADES ───────────────────────────────────────────────────── */}
        {tab === "unidades" && (() => {
          const principalIU    = itemUnidades.find((iu) => iu.isPrincipal);
          const principalSigla = principalIU?.unidade.sigla ?? item.unidade?.sigla ?? "UN";

          return (
            <div className="max-w-3xl space-y-6">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Unidades de Medida</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Unidades aceitas para movimentações e conversão automática para a unidade base.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={openAddUnidadeModal}
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar Unidade
                </Button>
              </div>

              {!unidadesLoaded ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                </div>
              ) : itemUnidades.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-xl text-muted-foreground gap-3">
                  <Ruler className="w-8 h-8 opacity-40" />
                  <p className="text-sm font-medium">Nenhuma unidade configurada</p>
                  <p className="text-xs text-center max-w-xs">
                    Adicione unidades de entrada (ex: CX, PCT) que serão convertidas automaticamente para a unidade base <span className="font-mono font-semibold">{principalSigla}</span>.
                  </p>
                  <Button
                    size="sm" variant="outline"
                    onClick={openAddUnidadeModal}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar Unidade
                  </Button>
                </div>
              ) : (
                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold">Unidade</th>
                        <th className="text-left px-4 py-3 font-semibold">Nome</th>
                        <th className="text-left px-4 py-3 font-semibold">Fator de Conversão</th>
                        <th className="text-center px-4 py-3 font-semibold w-24">Tipo</th>
                        <th className="w-12 px-3 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {itemUnidades.map((iu) => (
                        <tr
                          key={iu.id}
                          className="hover:bg-muted/60 group transition-colors cursor-pointer"
                          onClick={() => openEditUnidadeModal(iu)}
                        >
                          {/* Sigla */}
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm font-bold text-foreground bg-muted px-2 py-0.5 rounded">
                              {iu.unidade.sigla}
                            </span>
                          </td>
                          {/* Nome */}
                          <td className="px-4 py-3 text-foreground">{iu.unidade.nome}</td>
                          {/* Conversão */}
                          <td className="px-4 py-3">
                            {iu.isPrincipal ? (
                              <span className="text-muted-foreground text-xs italic">— unidade base, sem conversão</span>
                            ) : iu.fatorConversao ? (
                              <span className="flex items-center gap-1.5 text-sm text-foreground">
                                <span className="font-mono font-semibold text-info">
                                  1 {iu.unidade.sigla}
                                </span>
                                <span className="text-muted-foreground">=</span>
                                <span className="font-mono font-semibold text-success">
                                  {Number(iu.fatorConversao).toLocaleString("pt-BR", { maximumFractionDigits: 6 })} {iu.baseUnidade?.sigla ?? principalSigla}
                                </span>
                              </span>
                            ) : (
                              <span className="text-warning text-xs">Fator não definido</span>
                            )}
                          </td>
                          {/* Tipo */}
                          <td className="px-4 py-3 text-center">
                            {iu.isPrincipal ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-info/15 text-info">
                                Base
                              </span>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmPrincipal({ itemUnidadeId: iu.id, unidadeId: iu.unidade.id, sigla: iu.unidade.sigla, nome: iu.unidade.nome }); }}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-info/10 hover:text-info transition-colors border border-transparent hover:border-info/30"
                                title="Definir como unidade base"
                              >
                                Secundária
                              </button>
                            )}
                          </td>
                          {/* Remove */}
                          <td className="px-3 py-3">
                            {!iu.isPrincipal && (
                              <button
                                onClick={(e) => { e.stopPropagation(); removeItemUnidade(iu.id); }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-danger/10 text-muted-foreground hover:text-red-500 border border-transparent hover:border-danger/30"
                                title="Remover unidade"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-4 py-2.5 border-t border-border bg-muted text-xs text-muted-foreground">
                    {itemUnidades.length} unidade{itemUnidades.length !== 1 ? "s" : ""} cadastrada{itemUnidades.length !== 1 ? "s" : ""}
                    {" · "}Unidade base: <span className="font-mono font-semibold text-muted-foreground">{principalSigla}</span>
                  </div>
                </div>
              )}

            </div>
          );
        })()}

      </div>

      {/* ── Edit movimentação dialog ─────────────────────────────────────── */}
      {editMov && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-md space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">Editar Movimentação</h3>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{item.codigo} — {item.descricao}</p>
              </div>
              <button type="button" onClick={() => setEditMov(null)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tipo indicator (read-only) */}
            <div className="grid grid-cols-2 gap-2">
              {(["ENTRADA", "SAIDA"] as const).map((t) => (
                <div
                  key={t}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 text-sm font-medium",
                    editMov.tipo === t
                      ? t === "ENTRADA"
                        ? "border-emerald-500 bg-success/10 text-success"
                        : "border-red-500 bg-danger/10 text-danger"
                      : "border-border text-muted-foreground/60 bg-muted"
                  )}
                >
                  {t === "ENTRADA" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {t === "ENTRADA" ? "Entrada" : "Saída"}
                </div>
              ))}
            </div>

            <div className="space-y-3">
              {/* Local de Estoque (read-only) */}
              {editMov.localEstoqueNome && (
                <div className="space-y-1.5">
                  <Label>Local de Estoque</Label>
                  <div className="h-9 px-3 flex items-center text-sm bg-muted border border-border rounded-md text-muted-foreground">
                    {editMov.localEstoqueNome}
                  </div>
                </div>
              )}

              {/* Unidade + Quantidade */}
              {(() => {
                const principal = itemUnidades.find((iu) => iu.isPrincipal);
                const selectedIU = itemUnidades.find((iu) => iu.unidade.id === editMov.unidadeId);
                const isSecondary = selectedIU && !selectedIU.isPrincipal && !!selectedIU.fatorConversao;
                const fator = isSecondary ? Number(selectedIU!.fatorConversao) : 1;
                const qtd = parseFloat(editMov.quantidade) || 0;
                const qtdConvertida = qtd * fator;
                const principalSigla = principal?.unidade.sigla ?? item?.unidade?.sigla ?? item?.unidadeMedida ?? "un.";
                return (
                  <>
                    <div className="space-y-1.5">
                      <Label>Unidade *</Label>
                      {itemUnidades.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {itemUnidades.map((iu) => (
                            <button
                              key={iu.id} type="button"
                              onClick={() => setEditMov((p) => p ? { ...p, unidadeId: iu.unidade.id } : p)}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                                editMov.unidadeId === iu.unidade.id
                                  ? "border-blue-500 bg-info/10 text-info"
                                  : "border-border text-muted-foreground hover:border-border hover:bg-muted"
                              )}
                            >
                              <span className="font-mono font-semibold">{iu.unidade.sigla}</span>
                              {iu.isPrincipal && <span className="text-[10px] bg-success/15 text-success px-1 rounded font-medium">padrão</span>}
                              {!iu.isPrincipal && iu.fatorConversao && (
                                <span className="text-[10px] text-muted-foreground">= {Number(iu.fatorConversao).toLocaleString("pt-BR", { maximumFractionDigits: 6 })} {principalSigla}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-success/10 text-success text-sm font-mono font-semibold">
                          {principalSigla}
                          <span className="text-[10px] bg-success/15 text-success px-1 rounded font-medium">padrão</span>
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        Quantidade *
                        <span className="ml-1 text-xs font-normal text-muted-foreground">em {selectedIU?.unidade.sigla ?? principalSigla}</span>
                      </Label>
                      <Input
                        type="number" step="0.001" min="0.001"
                        value={editMov.quantidade}
                        onChange={(e) => setEditMov((p) => p ? { ...p, quantidade: e.target.value } : p)}
                        placeholder="0"
                      />
                      {isSecondary && qtd > 0 && (
                        <div className="flex items-center gap-1.5 text-xs bg-warning/10 border border-warning/30 rounded-lg px-3 py-2 text-warning">
                          <span className="font-mono font-semibold">{qtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {selectedIU!.unidade.sigla}</span>
                          <span className="text-amber-500">→</span>
                          <span className="font-mono font-bold text-success">{qtdConvertida.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {principalSigla}</span>
                          <span className="text-warning ml-1">(unidade padrão)</span>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}

              {/* Custo unitário (só ENTRADA) */}
              {editMov.tipo === "ENTRADA" && (
                <div className="space-y-1.5">
                  <Label>Custo Unitário (R$)</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={editMov.valorUnitario}
                    onChange={(e) => setEditMov((p) => p ? { ...p, valorUnitario: e.target.value } : p)}
                    placeholder="0,00"
                  />
                </div>
              )}

              {/* Data e Hora */}
              <div className="space-y-1.5">
                <Label>Data e Hora</Label>
                <Input
                  type="datetime-local"
                  value={editMov.dataMovimentacao}
                  onChange={(e) => setEditMov((p) => p ? { ...p, dataMovimentacao: e.target.value } : p)}
                />
              </div>

              {/* Documento e Observações */}
              <div className="grid grid-cols-2 gap-3">
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

              {editMovError && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{editMovError}</p>}
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button
                size="sm" variant="ghost"
                className="text-red-500 hover:text-danger hover:bg-danger/10 px-2"
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
                <Button size="sm" onClick={submitEditMov} disabled={editMovSaving}
                  className={editMov.tipo === "SAIDA" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}
                >
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
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center shrink-0 mt-0.5">
                <Trash2 className="w-5 h-5 text-danger" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Excluir movimentação?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className={cn(
                    "font-semibold",
                    deleteMovConfirm.tipo === "ENTRADA" ? "text-success" : "text-danger"
                  )}>
                    {deleteMovConfirm.tipo === "ENTRADA" ? "+" : "−"}{decimalToNumber(deleteMovConfirm.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                    {deleteMovConfirm.unidade ? ` ${deleteMovConfirm.unidade.sigla}` : ""}
                  </span>
                  {deleteMovConfirm.documento ? ` · ${deleteMovConfirm.documento}` : ""}
                  {" · "}{formatDateTime(deleteMovConfirm.createdAt)}
                </p>
                <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2 mt-2">
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

      {/* ── Modal: Inserir Saldo Inicial ──────────────────────────────── */}
      {showSaldoDialog && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-lg space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground text-base">
                  {saldoForm.editMovId ? "Editar Saldo" : "Inserir Saldo"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{item.codigo} — {item.descricao}</p>
              </div>
              <button onClick={() => setShowSaldoDialog(false)} className="text-muted-foreground hover:text-muted-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-info bg-info/10 border border-info/30 rounded-lg px-3 py-2">
              {saldoForm.editMovId
                ? "Editando um registro de saldo. O estoque será ajustado automaticamente com a diferença."
                : "Use este formulário para registrar estoque de itens que já estão físicamente no almoxarifado e não entraram pelo fluxo de compras."}
            </p>

            <div className="space-y-4">
              {saldoError && (
                <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{saldoError}</p>
              )}

              {/* Filial (para filtrar locais) */}
              <div className="space-y-1.5">
                <Label>Filial</Label>
                <ComboboxWithCreate
                  value={saldoFilialFilter}
                  onChange={(v) => { setSaldoFilialFilter(v); setSaldoForm((p) => ({ ...p, localEstoqueId: "" })); }}
                  noneLabel="Todas as filiais"
                  triggerClassName="h-9 rounded-md"
                  options={Array.from(new Map(
                    locaisEstoque
                      .filter((l) => l.filial)
                      .map((l) => [l.filial!.id, l.filial!])
                  ).values()).map((f) => ({ value: f.id, label: f.razaoSocial }))}
                />
              </div>

              {/* Local de Estoque */}
              <div className="space-y-1.5">
                <Label>Local de Estoque <span className="text-red-500">*</span></Label>
                <ComboboxWithCreate
                  value={saldoForm.localEstoqueId}
                  onChange={(v) => setSaldoForm((p) => ({ ...p, localEstoqueId: v }))}
                  disabled={!!saldoForm.editMovId}
                  placeholder="Selecionar local..."
                  noneLabel="Selecionar local..."
                  triggerClassName="h-9 rounded-md"
                  options={locaisEstoque
                    .filter((l) => !saldoFilialFilter || l.filial?.id === saldoFilialFilter)
                    .map((l) => ({ value: l.id, label: l.nome }))}
                />
                {saldoForm.editMovId && (
                  <p className="text-[11px] text-muted-foreground">O local de estoque não pode ser alterado na edição.</p>
                )}
              </div>

              {/* Unidade de Entrada */}
              {itemUnidades.length > 1 && (() => {
                const principalIU  = itemUnidades.find((iu) => iu.isPrincipal);
                const principalSigla = principalIU?.unidade.sigla ?? item.unidade?.sigla ?? item.unidadeMedida;
                return (
                  <div className="space-y-1.5">
                    <Label>Unidade de Entrada</Label>
                    <ComboboxWithCreate
                      value={saldoForm.unidadeEntradaId}
                      onChange={(v) => setSaldoForm((p) => ({ ...p, unidadeEntradaId: v }))}
                      allowNone={false}
                      triggerClassName="h-9 rounded-md"
                      options={itemUnidades.map((iu) => ({
                        value: iu.unidade.id,
                        label: `${iu.unidade.sigla} — ${iu.unidade.nome}${iu.isPrincipal ? " (unidade base)" : iu.fatorConversao ? ` (1 ${iu.unidade.sigla} = ${Number(iu.fatorConversao).toLocaleString("pt-BR", { maximumFractionDigits: 6 })} ${principalSigla})` : ""}`,
                      }))}
                    />
                  </div>
                );
              })()}

              {/* Data da movimentação */}
              <div className="space-y-1.5">
                <Label>Data <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={saldoForm.data}
                  onChange={(e) => setSaldoForm((p) => ({ ...p, data: e.target.value }))}
                  className="w-full"
                />
              </div>

              {/* Saldo + Saldo Disponível (convertido) */}
              {(() => {
                const principalIU    = itemUnidades.find((iu) => iu.isPrincipal);
                const principalSigla = principalIU?.unidade.sigla ?? item.unidade?.sigla ?? item.unidadeMedida;
                const selectedIU     = itemUnidades.find((iu) => iu.unidade.id === saldoForm.unidadeEntradaId);
                const entradaSigla   = selectedIU?.unidade.sigla ?? principalSigla;
                const fator          = (selectedIU && !selectedIU.isPrincipal && selectedIU.fatorConversao)
                                         ? Number(selectedIU.fatorConversao) : 1;
                const qtdBase        = saldoForm.saldo ? parseFloat(saldoForm.saldo) * fator : null;
                const isConverted    = fator !== 1;
                return (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Saldo <span className="text-red-500">*</span></Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number" step="0.001" min="0.001"
                          value={saldoForm.saldo}
                          onChange={(e) => setSaldoForm((p) => ({ ...p, saldo: e.target.value }))}
                          placeholder="0"
                        />
                        <span className="text-xs text-muted-foreground font-mono shrink-0">{entradaSigla}</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Saldo em {principalSigla}</Label>
                      <div className={`flex items-center gap-2 h-9 px-3 rounded-md border ${isConverted ? "border-info/30 bg-info/10" : "border-border bg-muted"}`}>
                        <span className={`text-sm font-semibold ${isConverted ? "text-info" : "text-muted-foreground"}`}>
                          {qtdBase != null ? qtdBase.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : "—"}
                        </span>
                        <span className={`text-xs ml-1 ${isConverted ? "text-blue-500" : "text-muted-foreground"}`}>{principalSigla}</span>
                        {isConverted && <span className="ml-auto text-[10px] text-blue-400">×{fator}</span>}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Custo + Custo Médio + Custo Total */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Custo Unit. (R$)</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={saldoForm.custo}
                    onChange={(e) => setSaldoForm((p) => ({ ...p, custo: e.target.value }))}
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Custo Médio</Label>
                  <div className="flex items-center h-9 px-3 rounded-md border border-border bg-violet-50 dark:bg-violet-500/15">
                    <span className="text-sm text-violet-700 dark:text-violet-300 font-semibold">
                      {saldoForm.custo ? formatBRL(parseFloat(saldoForm.custo)) : (custoUnit > 0 ? formatBRL(custoUnit) : "—")}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Custo Total</Label>
                  <div className="flex items-center h-9 px-3 rounded-md border border-border bg-info/10">
                    <span className="text-sm text-info font-semibold">
                      {(() => {
                        if (!saldoForm.custo || !saldoForm.saldo) return "—";
                        const selectedIU = itemUnidades.find((iu) => iu.unidade.id === saldoForm.unidadeEntradaId);
                        const fator = (selectedIU && !selectedIU.isPrincipal && selectedIU.fatorConversao) ? Number(selectedIU.fatorConversao) : 1;
                        return formatBRL(parseFloat(saldoForm.custo) * parseFloat(saldoForm.saldo) * fator);
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Endereço */}
              <div className="space-y-1.5">
                <Label>Endereço / Localização</Label>
                <Input
                  value={saldoForm.endereco}
                  onChange={(e) => setSaldoForm((p) => ({ ...p, endereco: e.target.value }))}
                  placeholder="Ex: Prateleira A3, Corredor 2..."
                />
                <p className="text-[11px] text-muted-foreground">Localização física dentro do almoxarifado</p>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button size="sm" variant="outline" onClick={() => setShowSaldoDialog(false)} disabled={saldoSaving}>Cancelar</Button>
              <Button size="sm" onClick={submitSaldo} disabled={saldoSaving || !saldoForm.localEstoqueId || !saldoForm.saldo}>
                {saldoSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                <PackageCheck className="w-3.5 h-3.5 mr-1.5" />
                {saldoForm.editMovId ? "Salvar Alterações" : "Inserir Saldo"}
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
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">Nova Necessidade de Compra</h3>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{item.codigo} — {item.descricao}</p>
              </div>
              <button onClick={() => setShowNecessidade(false)} className="text-muted-foreground hover:text-muted-foreground">
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
                  <span className="text-sm text-muted-foreground font-mono shrink-0">
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
                <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{necError}</p>
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

      {/* ── Modal: Adicionar / Editar unidade ──────────────────────────── */}
      {unidadeModal && typeof window !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[9200] bg-black/40 backdrop-blur-sm" onClick={() => setUnidadeModal(null)} />
          <div className="fixed inset-0 z-[9201] flex items-center justify-center p-4 pointer-events-none">
            <div
              className="w-full max-w-sm bg-card rounded-2xl shadow-2xl border border-border overflow-hidden pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">
                  {unidadeModal.mode === "add" ? "Adicionar Unidade" : `Editar ${unidadeModal.sigla} — ${unidadeModal.nome}`}
                </h2>
                <button onClick={() => setUnidadeModal(null)} className="text-muted-foreground hover:text-muted-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-5 space-y-4">
                {unidadeModalError && (
                  <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{unidadeModalError}</p>
                )}

                {/* Unidade selector — only for add */}
                {unidadeModal.mode === "add" && (() => {
                  const principalIU    = itemUnidades.find((iu) => iu.isPrincipal);
                  const principalSigla = principalIU?.unidade.sigla ?? item?.unidade?.sigla ?? "UN";
                  const availableUnidades = unidades.filter((u) => !itemUnidades.some((iu) => iu.unidade.id === u.id));
                  const selectedSigla = unidades.find((u) => u.id === unidadeModal.unidadeId)?.sigla ?? "?";
                  return (
                    <>
                      <div className="space-y-1.5">
                        <Label>Unidade <span className="text-red-500">*</span></Label>
                        <ComboboxWithCreate
                          value={unidadeModal.unidadeId}
                          onChange={(v) => {
                            const u = unidades.find((x) => x.id === v);
                            setUnidadeModal((m) => m ? { ...m, unidadeId: v, sigla: u?.sigla ?? "", nome: u?.nome ?? "" } : m);
                          }}
                          placeholder="Selecionar..."
                          noneLabel="Selecionar..."
                          triggerClassName="h-9 rounded-md"
                          options={availableUnidades.map((u) => ({ value: u.id, label: `${u.sigla} — ${u.nome}` }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Fator de Conversão</Label>
                        <Input
                          type="number" step="0.000001" min="0"
                          value={unidadeModal.fatorConversao}
                          onChange={(e) => setUnidadeModal((m) => m ? { ...m, fatorConversao: e.target.value } : m)}
                          placeholder="Ex: 325"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          1 {unidadeModal.unidadeId ? selectedSigla : "?"} = ? {principalSigla}
                        </p>
                      </div>
                    </>
                  );
                })()}

                {/* Edit mode — only fator */}
                {unidadeModal.mode === "edit" && (() => {
                  const principalIU    = itemUnidades.find((iu) => iu.isPrincipal);
                  const principalSigla = principalIU?.unidade.sigla ?? item?.unidade?.sigla ?? "UN";
                  return unidadeModal.isPrincipal ? (
                    <p className="text-sm text-muted-foreground">
                      Esta é a <span className="font-semibold text-info">unidade base</span> do produto — ela não possui fator de conversão.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <Label>Fator de Conversão</Label>
                      <Input
                        type="number" step="0.000001" min="0"
                        value={unidadeModal.fatorConversao}
                        onChange={(e) => setUnidadeModal((m) => m ? { ...m, fatorConversao: e.target.value } : m)}
                        placeholder="Ex: 325"
                        autoFocus
                      />
                      <p className="text-[11px] text-muted-foreground">
                        1 {unidadeModal.sigla} = ? {principalSigla}
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Footer */}
              <div className="flex gap-2 justify-end px-5 pb-5">
                <Button variant="outline" size="sm" onClick={() => setUnidadeModal(null)} disabled={unidadeModalSaving}>
                  Cancelar
                </Button>
                {!(unidadeModal.mode === "edit" && unidadeModal.isPrincipal) && (
                  <Button
                    size="sm"
                    onClick={saveUnidadeModal}
                    disabled={unidadeModalSaving || (unidadeModal.mode === "add" && !unidadeModal.unidadeId)}
                  >
                    {unidadeModalSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                    {unidadeModal.mode === "add" ? "Adicionar" : "Salvar"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* ── Confirmação: promover unidade a base ───────────────────────── */}
      {confirmPrincipal && typeof window !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[9300] bg-black/40 backdrop-blur-sm" onClick={() => setConfirmPrincipal(null)} />
          <div className="fixed inset-0 z-[9301] flex items-center justify-center p-4 pointer-events-none">
            <div
              className="w-full max-w-sm bg-card rounded-2xl shadow-2xl border border-border overflow-hidden pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-5">
                <h2 className="text-sm font-semibold text-foreground mb-1">Alterar unidade base?</h2>
                <p className="text-sm text-muted-foreground">
                  A unidade{" "}
                  <span className="font-semibold text-foreground">
                    {confirmPrincipal.sigla} — {confirmPrincipal.nome}
                  </span>{" "}
                  passará a ser a <span className="font-semibold text-info">unidade base</span> do produto.
                  Todos os estoques e conversões são referenciados pela unidade base.
                </p>
              </div>
              <div className="flex gap-2 justify-end px-5 pb-5">
                <Button variant="outline" size="sm" onClick={() => setConfirmPrincipal(null)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => {
                    setPrincipal(confirmPrincipal.itemUnidadeId, confirmPrincipal.unidadeId);
                    setConfirmPrincipal(null);
                  }}
                >
                  Confirmar
                </Button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {showMovDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-md space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">Nova Movimentação</h3>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{item.codigo} — {item.descricao}</p>
              </div>
              <button onClick={() => setShowMovDialog(false)} className="text-muted-foreground hover:text-muted-foreground">
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
                        ? "border-emerald-500 bg-success/10 text-success"
                        : "border-red-500 bg-danger/10 text-danger"
                      : "border-border text-muted-foreground hover:border-border"
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
                      <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2.5">
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
                                  ? "border-blue-500 bg-info/10 text-info"
                                  : "border-border text-muted-foreground hover:border-border hover:bg-muted"
                              )}
                            >
                              <span className="font-mono font-semibold">{iu.unidade.sigla}</span>
                              {iu.isPrincipal && (
                                <span className="text-[10px] bg-success/15 text-success px-1 rounded font-medium">padrão</span>
                              )}
                              {!iu.isPrincipal && iu.fatorConversao && (
                                <span className="text-[10px] text-muted-foreground">
                                  = {Number(iu.fatorConversao).toLocaleString("pt-BR", { maximumFractionDigits: 6 })} {principalSigla}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        // No itemUnidades defined — show item's base unit as read-only badge
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-success/10 text-success text-sm font-mono font-semibold">
                            {principalSigla}
                            <span className="text-[10px] bg-success/15 text-success px-1 rounded font-medium">padrão</span>
                          </span>
                          <span className="text-xs text-muted-foreground">Cadastre unidades na aba Unidades para mais opções</span>
                        </div>
                      )}
                    </div>

                    {/* Quantidade */}
                    <div className="space-y-1.5">
                      <Label>
                        Quantidade *
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
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
                        <div className="flex items-center gap-1.5 text-xs bg-warning/10 border border-warning/30 rounded-lg px-3 py-2 text-warning">
                          <span className="font-mono font-semibold">
                            {qtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {selectedIU!.unidade.sigla}
                          </span>
                          <span className="text-amber-500">→</span>
                          <span className="font-mono font-bold text-success">
                            {qtdConvertida.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {principalSigla}
                          </span>
                          <span className="text-warning ml-1">(unidade padrão)</span>
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

              {/* Data e Hora */}
              <div className="space-y-1.5">
                <Label>Data e Hora</Label>
                <Input
                  type="datetime-local"
                  value={movForm.dataMovimentacao}
                  onChange={(e) => setMovForm((p) => ({ ...p, dataMovimentacao: e.target.value }))}
                />
              </div>

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
                <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{movError}</p>
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
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
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
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        {addHref && (
          <Link href={addHref} className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-500 hover:text-info">
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
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-sm text-foreground", mono && "font-mono")}>{value || "—"}</p>
    </div>
  );
}

const KPI_COLORS: Record<string, { bg: string; icon: string; value: string; border: string }> = {
  blue:    { bg: "bg-info/10",    icon: "text-blue-500",    value: "text-blue-900",    border: "border-info/20" },
  emerald: { bg: "bg-success/10", icon: "text-emerald-500", value: "text-emerald-900", border: "border-emerald-100" },
  amber:   { bg: "bg-warning/10",   icon: "text-amber-500",   value: "text-amber-900",   border: "border-amber-100" },
  red:     { bg: "bg-danger/10",     icon: "text-red-500",     value: "text-red-900",     border: "border-danger/20" },
  violet:  { bg: "bg-violet-50 dark:bg-violet-500/15",  icon: "text-violet-500",  value: "text-violet-900",  border: "border-violet-100" },
  gray:    { bg: "bg-muted",    icon: "text-muted-foreground",    value: "text-foreground",    border: "border-border" },
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
            <button className="text-muted-foreground hover:text-muted-foreground transition-colors p-0.5 rounded">
              <InfoIcon className="w-3.5 h-3.5" />
            </button>
            {/* Tooltip */}
            <div className="absolute right-0 top-6 z-50 w-64 bg-card border border-border rounded-xl shadow-lg p-3 text-left
                            invisible opacity-0 group-hover:visible group-hover:opacity-100
                            transition-all duration-150 pointer-events-none">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Cálculo</p>
              <p className="text-xs text-foreground leading-relaxed mb-2.5">{hint.formula}</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Interpretação</p>
              <p className="text-xs text-foreground leading-relaxed">{hint.interpretation}</p>
            </div>
          </div>
        )}
      </div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide leading-none">{title}</p>
      <p className={cn("text-2xl font-bold leading-tight", c.value)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── ConsumoChart ──────────────────────────────────────────────────────────────
function ConsumoChart({ itemId }: { itemId: string }) {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [key, setKey] = useState(0);

  return (
    <div className="relative">
      {status === "loading" && (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Carregando gráfico…</span>
        </div>
      )}
      {status === "error" && (
        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
          <p className="text-sm">Não foi possível carregar o gráfico.</p>
          <button
            onClick={() => { setStatus("loading"); setKey((k) => k + 1); }}
            className="text-xs text-info hover:underline flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Tentar novamente
          </button>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={key}
        src={`/api/suprimentos/produtos/${itemId}/consumo-chart`}
        alt="Gráfico de evolução do saldo"
        className={cn("w-full rounded-lg", status !== "ok" && "hidden")}
        onLoad={() => setStatus("ok")}
        onError={() => setStatus("error")}
      />
    </div>
  );
}

// ── ParamBadge ────────────────────────────────────────────────────────────────
function ParamBadge({
  label, value, color,
}: { label: string; value: string; color: "amber" | "red" | "gray" }) {
  const cls = {
    amber: "bg-warning/10 border-warning/30 text-warning",
    red:   "bg-danger/10   border-danger/30   text-danger",
    gray:  "bg-muted  border-border  text-foreground",
  }[color];
  return (
    <div className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs", cls)}>
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
