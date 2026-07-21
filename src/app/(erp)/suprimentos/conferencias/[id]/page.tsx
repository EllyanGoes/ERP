"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/shared/StatusBadge";
import { Autoria } from "@/components/shared/Autoria";
import { formatDate, formatBRL, decimalToNumber, cn } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";
import { useRouter } from "next/navigation";
import { ShieldAlert, Save, Loader2, Trash2, LinkIcon, Pencil, Info } from "lucide-react";
import InfoHint from "@/components/shared/InfoHint";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";
import NaturezaCombobox, { type NaturezaOpt } from "@/components/financeiro/NaturezaCombobox";
import { useEscToClose } from "@/lib/use-esc-to-close";
import DuplicatasTab, { type TituloResumo } from "@/components/suprimentos/DuplicatasTab";
import ModoToggle from "@/components/suprimentos/ModoToggle";
import { previewDuplicatasDE, type CondicaoFull, type ParcelaCustomRow } from "@/lib/duplicatas-preview";

const UF_LIST = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

type FornecedorOption = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
};

type LocalEstoque = { id: string; nome: string } | null;

type ConferenciaItem = {
  id: string;
  // Componente (filho): decompõe o preço da linha pai — não movimenta estoque.
  paiId?: string | null;
  quantidadePedida: unknown;
  quantidadeRecebida: unknown;
  divergencia: boolean;
  observacao: string | null;
  vlrUnitario: unknown;
  vlrTotal: unknown;
  vlrIPI: unknown;
  vlrICMS: unknown;
  tipoEntrada: string | null;
  codFiscal: string | null;
  tpOper: string | null;
  localEstoqueId: string | null;
  localEstoque: LocalEstoque;
  centroCustoId: string | null;
  centroCusto: { id: string; codigo: string; nome: string } | null;
  capitaliza: boolean | null;
  imobilizadoId: string | null;
  imobilizado: { id: string; descricao: string } | null;
  componenteSubstituidoId: string | null;
  tesId: string | null;
  compoeCusto: boolean | null;
  naturezaFinanceiraId?: string | null;
  desconto: unknown;
  unidadeId: string | null;
  item: {
    id: string; codigo: string; descricao: string; unidadeMedida: string;
    unidade?: { id: string; sigla: string } | null;
    itemUnidades?: { unidadeId: string; fatorConversao: unknown; isPrincipal: boolean; unidade: { sigla: string } }[];
  };
};

type FornecedorInfo = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
  contato: string | null;
  email: string | null;
};

type Conferencia = {
  id: string;
  numero: string;
  status: string;
  dataConferencia: string | null;
  responsavel: string | null;
  observacoes: string | null;
  tipoNota: string | null;
  numeroNF: string | null;
  serie: string | null;
  dtEmissao: string | null;
  ufOrigem: string | null;
  espDocumento: string | null;
  frete: unknown;
  tipoFrete: string | null;
  seguro: unknown;
  despesas: unknown;
  desconto: unknown;
  vrTotal: unknown;
  condicaoPagamentoId: string | null;
  formaPagamentoId: string | null;
  naturezaFinanceiraId: string | null;
  // Pagamento já realizado (entrada/sinal) + grade manual de duplicatas.
  valorPagoAntecipado?: unknown;
  dataPagoAntecipado?: string | null;
  formaPagoAntecipadoId?: string | null;
  contaPagoAntecipadoId?: string | null;
  parcelasCustom?: { valor: number; dataVencimento: string | null }[] | null;
  pedidoId: string | null;
  localEstoqueId: string | null;
  modoLocalEstoque: string | null;
  localEstoque: { id: string; nome: string } | null;
  pedido: {
    id: string;
    numero: string;
    condicaoPagamentoId: string | null;
    condicoesPagamento: string | null;
    frete: unknown;
    seguro: unknown;
    despesas: unknown;
    vrDesconto: unknown;
    valorTotal: unknown;
    intragrupo: boolean | null;
    fornecedor: FornecedorInfo;
    contasPagar?: TituloResumo[];
    itens?: { valorTotal: unknown }[];
  } | null;
  fornecedor: FornecedorInfo | null;
  itens: ConferenciaItem[];
  contasPagar?: TituloResumo[];
  criadoPor?: string | null;
  atualizadoPor?: string | null;
};

// Opção de unidade de compra de um item (base + alternativas) com o fator.
type UnidadeOpc = { unidadeId: string; sigla: string; fator: number; base: boolean };

type EditItem = {
  id: string;
  paiId: string;                 // "" = linha normal; senão, componente do item pai
  quantidadeRecebida: string;
  observacao: string;
  vlrUnitario: string;
  vlrTotal: string;
  vlrIPI: string;
  vlrICMS: string;
  tipoEntrada: string;
  codFiscal: string;
  tpOper: string;
  localEstoqueId: string;
  centroCustoId: string;      // herdado do pedido (default editável); não classifica custo
  naturezaFinanceiraId: string; // natureza da linha (default: sugestão do TES)
  tesId: string;              // TES (preset de comportamento) da linha
  compoeCusto: boolean | null; // preenchido pelo TES (null = herda item)
  capitaliza: boolean;        // capex nesta linha (carga/orçamento na entrada); exige bem
  imobilizadoId: string;
  componenteSubstituidoId: string;
  desconto: string;
  unidadeId: string;          // unidade de compra escolhida ("" = base)
  unidades: UnidadeOpc[];     // opções (base + alternativas) do item
  baseSigla: string;          // sigla da unidade base (p/ o hint convertido)
};

type LocalEstoqueOption = { id: string; nome: string };
type ProdutoOption = { id: string; codigo: string; descricao: string; unidadeMedida: string };
type NewItem = {
  _key: string;
  paiId: string;                 // componente de item EXISTENTE (id da linha pai)
  paiKey: string;                // componente de item NOVO (_key da linha pai)
  itemId: string;
  codigo: string;
  descricao: string;
  unidadeMedida: string;
  quantidadeRecebida: string;
  vlrUnitario: string;
  vlrTotal: string;
  vlrIPI: string;
  vlrICMS: string;
  desconto: string;
  localEstoqueId: string;
  centroCustoId: string;
  naturezaFinanceiraId: string;
  tesId: string;
  compoeCusto: boolean | null;
  capitaliza: boolean;
  imobilizadoId: string;
  componenteSubstituidoId: string;
};

function getItemStatus(pedida: number, recebida: number): { label: string; cls: string } {
  if (recebida === 0) return { label: "Faltante", cls: "bg-danger/15 text-danger" };
  if (Math.abs(pedida - recebida) > 0.001) return { label: "Divergência", cls: "bg-warning/15 text-warning" };
  return { label: "OK", cls: "bg-success/15 text-success" };
}

export default function DocumentoEntradaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";
  const router = useRouter();

  // Modo detalhes por padrão; edição só ao clicar em "Editar" (ou ?edit=1).
  const [modoEdicao, setModoEdicao] = useState(searchParams.get("edit") === "1");

  const [conferencia, setConferencia] = useState<Conferencia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actioning, setActioning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [autoVinculoMsg, setAutoVinculoMsg] = useState<string | null>(null);
  const [scAtendidaMsg, setScAtendidaMsg] = useState<{ numero: string; status: string }[] | null>(null);

  // Popup: novos vínculos antes de concluir
  type VinculoItem = { id: string; codigo: string; descricao: string };
  const [vinculoPopup, setVinculoPopup] = useState<{ fornecedorNome: string; novos: VinculoItem[] } | null>(null);
  useEscToClose(() => setVinculoPopup(null), !!vinculoPopup);

  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [responsavel, setResponsavel] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // NF fields (editable when PENDENTE)
  const [tipoNota, setTipoNota] = useState("");
  const [numeroNF, setNumeroNF] = useState("");
  const [serie, setSerie] = useState("");
  const [dtEmissao, setDtEmissao] = useState("");
  const [ufOrigem, setUfOrigem] = useState("");
  const [espDocumento, setEspDocumento] = useState("");
  const [frete, setFrete] = useState("");
  const [seguro, setSeguro] = useState("");
  const [despesas, setDespesas] = useState("");
  const [desconto, setDesconto] = useState("");
  const [condicaoPagamentoId, setCondicaoPagamentoId] = useState("");
  const [condicoes, setCondicoes] = useState<CondicaoFull[]>([]);
  const [formaPagamentoId, setFormaPagamentoId] = useState("");
  const [formasPagamento, setFormasPagamento] = useState<{ id: string; nome: string; tipo?: string; ativo?: boolean }[]>([]);
  const [naturezaFinanceiraId, setNaturezaFinanceiraId] = useState("");
  const [naturezas, setNaturezas] = useState<NaturezaOpt[]>([]);
  // Pagamento JÁ REALIZADO (entrada/sinal da fatura) — vira título quitado na conclusão.
  const [valorPagoAntecipado, setValorPagoAntecipado] = useState("");
  const [dataPagoAntecipado, setDataPagoAntecipado] = useState("");
  const [formaPagoAntecipadoId, setFormaPagoAntecipadoId] = useState("");
  const [contaPagoAntecipadoId, setContaPagoAntecipadoId] = useState("");
  const [contasBancarias, setContasBancarias] = useState<{ id: string; nome: string; compensacao?: boolean; ativo?: boolean }[]>([]);
  // Grade manual de duplicatas (null = automática pela condição).
  const [parcelasCustom, setParcelasCustom] = useState<ParcelaCustomRow[] | null>(null);
  // Componente: linha pendente aguardando escolha do produto ("+ Componente").
  const [componenteDe, setComponenteDe] = useState<{ paiId?: string; paiKey?: string; descricao: string } | null>(null);
  const [validationError, setValidationError] = useState("");
  const [localAlertDismissed, setLocalAlertDismissed] = useState(false);
  const [showDivergenciaConfirm, setShowDivergenciaConfirm] = useState(false);

  // Local de estoque (header-level)
  const [modoLocalEstoque, setModoLocalEstoque] = useState<"GLOBAL" | "POR_ITEM">("POR_ITEM");
  const [localEstoqueGlobalId, setLocalEstoqueGlobalId] = useState("");

  // TES e Centro de custo também têm modo Global/Por Item. É só UI: o valor
  // global é aplicado a todas as linhas (a persistência continua por item).
  const [modoTes, setModoTes] = useState<"GLOBAL" | "POR_ITEM">("POR_ITEM");
  const [tesGlobalId, setTesGlobalId] = useState("");
  const [modoCentro, setModoCentro] = useState<"GLOBAL" | "POR_ITEM">("POR_ITEM");
  const [centroGlobalId, setCentroGlobalId] = useState("");
  // Natureza: GLOBAL usa o campo da aba Duplicatas (aplicado a todas as linhas);
  // POR_ITEM abre a coluna na tabela (default preenchido pela sugestão do TES).
  const [modoNatureza, setModoNatureza] = useState<"GLOBAL" | "POR_ITEM">("GLOBAL");

  // Aba ativa do rodapé (padrão Protheus: Duplicatas em destaque)
  const [aba, setAba] = useState<"duplicatas" | "pagamento" | "totais" | "outros">("duplicatas");

  // Fornecedor search (editable)
  const [fornecedorId, setFornecedorId] = useState("");
  const [fornecedores, setFornecedores] = useState<FornecedorOption[]>([]);

  // Usuário (responsável)
  const [usuarioResponsavelId, setUsuarioResponsavelId] = useState("");
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string; email: string }[]>([]);

  const [saving, setSaving] = useState(false);
  const [locaisEstoque, setLocaisEstoque] = useState<LocalEstoqueOption[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<{ id: string; codigo: string; nome: string; grupoCentroCusto?: { nome: string } | null }[]>([]);
  const [imobilizados, setImobilizados] = useState<{ id: string; descricao: string }[]>([]);
  const [tesList, setTesList] = useState<{ id: string; codigo: string; nome: string; sentido: string; estocavel: boolean; almoxarifadoDefaultId: string | null; compoeCusto: boolean; permiteCapitalizar: boolean; centroCustoSugeridoId: string | null; naturezaSugeridaId?: string | null; ativo: boolean }[]>([]);

  // Add item inline
  const [produtos, setProdutos] = useState<ProdutoOption[]>([]);
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [addItemSearch, setAddItemSearch] = useState("");
  const [showAddRow, setShowAddRow] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suprimentos/conferencias/${id}`);
      const json = await res.json();
      const conf: Conferencia = json.data;
      setConferencia(conf);
      // Auto-fill responsavel with current user if not yet set
      const respoNome = conf.responsavel ?? user?.nome ?? "";
      setResponsavel(respoNome);
      setObservacoes(conf.observacoes ?? "");
      setTipoNota(
        conf.tipoNota === "SN" ? "SN" : "NF"
      );
      setEspDocumento(conf.espDocumento ?? "");
      setNumeroNF(conf.numeroNF ?? "");
      setSerie(conf.serie ?? "");
      setDtEmissao(conf.dtEmissao ? conf.dtEmissao.slice(0, 10) : new Date().toLocaleDateString("sv-SE"));
      setUfOrigem(conf.ufOrigem ?? "");
      // Condição do DE: usa a do próprio DE, senão herda a do pedido.
      setCondicaoPagamentoId(conf.condicaoPagamentoId ?? conf.pedido?.condicaoPagamentoId ?? "");
      setFormaPagamentoId(conf.formaPagamentoId ?? "");
      setNaturezaFinanceiraId(conf.naturezaFinanceiraId ?? "");
      setValorPagoAntecipado(decimalToNumber(conf.valorPagoAntecipado) > 0 ? String(decimalToNumber(conf.valorPagoAntecipado)) : "");
      setDataPagoAntecipado(conf.dataPagoAntecipado ? conf.dataPagoAntecipado.slice(0, 10) : "");
      setFormaPagoAntecipadoId(conf.formaPagoAntecipadoId ?? "");
      setContaPagoAntecipadoId(conf.contaPagoAntecipadoId ?? "");
      setParcelasCustom(Array.isArray(conf.parcelasCustom) && conf.parcelasCustom.length > 0 ? conf.parcelasCustom : null);
      setFrete(decimalToNumber(conf.frete) > 0 ? String(decimalToNumber(conf.frete)) : "");
      const forn = conf.fornecedor ?? conf.pedido?.fornecedor ?? null;
      setFornecedorId(forn?.id ?? "");
      const modo = (conf.modoLocalEstoque === "GLOBAL" ? "GLOBAL" : "POR_ITEM") as "GLOBAL" | "POR_ITEM";
      setModoLocalEstoque(modo);
      setLocalEstoqueGlobalId(conf.localEstoqueId ?? "");
      setSeguro(decimalToNumber(conf.seguro) > 0 ? String(decimalToNumber(conf.seguro)) : "");
      setDespesas(decimalToNumber(conf.despesas) > 0 ? String(decimalToNumber(conf.despesas)) : "");
      setDesconto(decimalToNumber(conf.desconto) > 0 ? String(decimalToNumber(conf.desconto)) : "");

      const resolvedModo = conf.modoLocalEstoque === "GLOBAL" ? "GLOBAL" : "POR_ITEM";
      const globalLocalId = conf.localEstoqueId ?? "";

      // TES/Centro: se todas as linhas já compartilham o mesmo valor (não vazio),
      // abre em modo Global com esse valor; senão, Por Item.
      const tesIds = conf.itens.map((i) => i.tesId ?? "");
      const tesUnico = tesIds.length > 0 && tesIds.every((t) => t === tesIds[0]) ? tesIds[0] : "";
      setModoTes(tesUnico ? "GLOBAL" : "POR_ITEM");
      setTesGlobalId(tesUnico || "");
      const ccIds = conf.itens.map((i) => i.centroCustoId ?? "");
      const ccUnico = ccIds.length > 0 && ccIds.every((c) => c === ccIds[0]) ? ccIds[0] : "";
      setModoCentro(ccUnico ? "GLOBAL" : "POR_ITEM");
      setCentroGlobalId(ccUnico || "");
      // Natureza: linhas uniformes (ou vazias) abrem em Global; mistas, Por Item.
      const natIds = conf.itens.filter((i) => !i.paiId).map((i) => i.naturezaFinanceiraId ?? "");
      const natMista = new Set(natIds).size > 1;
      setModoNatureza(natMista ? "POR_ITEM" : "GLOBAL");
      setEditItems(
        conf.itens.map((i) => {
          // Unidades de compra: base (sigla do item) + alternativas (fator).
          const baseSigla = i.item.unidade?.sigla ?? i.item.unidadeMedida ?? "un";
          const alternativas: UnidadeOpc[] = (i.item.itemUnidades ?? [])
            .filter((iu) => !iu.isPrincipal && iu.fatorConversao != null)
            .map((iu) => ({ unidadeId: iu.unidadeId, sigla: iu.unidade.sigla, fator: decimalToNumber(iu.fatorConversao), base: false }))
            .filter((u) => u.fator > 0);
          const unidades: UnidadeOpc[] = [{ unidadeId: "", sigla: baseSigla, fator: 1, base: true }, ...alternativas];
          return {
            id: i.id,
            paiId: i.paiId ?? "",
            quantidadeRecebida: decimalToNumber(i.quantidadeRecebida).toString(),
            observacao: i.observacao ?? "",
            vlrUnitario: decimalToNumber(i.vlrUnitario) > 0 ? String(decimalToNumber(i.vlrUnitario)) : "",
            vlrTotal: decimalToNumber(i.vlrTotal) > 0 ? String(decimalToNumber(i.vlrTotal)) : "",
            vlrIPI: decimalToNumber(i.vlrIPI) > 0 ? String(decimalToNumber(i.vlrIPI)) : "",
            vlrICMS: decimalToNumber(i.vlrICMS) > 0 ? String(decimalToNumber(i.vlrICMS)) : "",
            tipoEntrada: i.tipoEntrada ?? "",
            codFiscal: i.codFiscal ?? "",
            tpOper: i.tpOper ?? "",
            localEstoqueId: resolvedModo === "GLOBAL" ? globalLocalId : (i.localEstoqueId ?? ""),
            centroCustoId: i.centroCustoId ?? "",
            naturezaFinanceiraId: (i as { naturezaFinanceiraId?: string | null }).naturezaFinanceiraId ?? "",
            tesId: i.tesId ?? "",
            compoeCusto: i.compoeCusto ?? null,
            capitaliza: i.capitaliza ?? false,
            imobilizadoId: i.imobilizadoId ?? "",
            componenteSubstituidoId: i.componenteSubstituidoId ?? "",
            desconto: decimalToNumber(i.desconto) > 0 ? String(decimalToNumber(i.desconto)) : "",
            unidadeId: i.unidadeId ?? "",
            unidades,
            baseSigla,
          };
        })
      );
    } catch {
      setError("Erro ao carregar documento");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/suprimentos/condicoes-pagamento").then((r) => r.json())
      .then((j) => setCondicoes(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
    fetch("/api/suprimentos/formas-pagamento").then((r) => r.json())
      .then((j) => setFormasPagamento(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
    fetch("/api/financeiro/naturezas?tipo=SAIDA&ativo=1").then((r) => r.json())
      .then((j) => setNaturezas(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
    fetch("/api/empresa/centros-custo?ativo=true").then((r) => r.json())
      .then((j) => setCentrosCusto(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
    fetch("/api/contabilidade/imobilizado").then((r) => r.json())
      .then((j) => setImobilizados(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
    fetch("/api/suprimentos/tipos-operacao").then((r) => r.json())
      .then((j) => setTesList((Array.isArray(j) ? j : (j.data ?? [])).filter((t: { ativo?: boolean; sentido?: string }) => t.ativo !== false && t.sentido !== "SAIDA")))
      .catch(() => {});
    // Contas p/ o pagamento já realizado (sem transitórias de compensação).
    fetch("/api/financeiro/contas").then((r) => r.json())
      .then((j) => setContasBancarias((Array.isArray(j) ? j : (j.data ?? [])).filter((c: { compensacao?: boolean; ativo?: boolean }) => !c.compensacao && c.ativo !== false)))
      .catch(() => {});
  }, []);

  // Escolher o TES preenche as flags da linha (editáveis). NÃO decide destino.
  function applyTesEdit(itemId: string, tesId: string) {
    const tes = tesList.find((t) => t.id === tesId);
    setEditItems((prev) => prev.map((i) => {
      if (i.id !== itemId) return i;
      const next = { ...i, tesId };
      if (tes) {
        next.compoeCusto = tes.compoeCusto;
        if (tes.estocavel && tes.almoxarifadoDefaultId && modoLocalEstoque === "POR_ITEM") next.localEstoqueId = tes.almoxarifadoDefaultId;
        if (tes.centroCustoSugeridoId) next.centroCustoId = tes.centroCustoSugeridoId;
        if (tes.naturezaSugeridaId && modoNatureza === "POR_ITEM") next.naturezaFinanceiraId = tes.naturezaSugeridaId;
        if (!tes.permiteCapitalizar) { next.capitaliza = false; next.imobilizadoId = ""; next.componenteSubstituidoId = ""; }
      } else { next.compoeCusto = null; }
      return next;
    }));
  }
  function applyTesNew(key: string, tesId: string) {
    const tes = tesList.find((t) => t.id === tesId);
    setNewItems((prev) => prev.map((ni) => {
      if (ni._key !== key) return ni;
      const next = { ...ni, tesId };
      if (tes) {
        next.compoeCusto = tes.compoeCusto;
        if (tes.estocavel && tes.almoxarifadoDefaultId && modoLocalEstoque === "POR_ITEM") next.localEstoqueId = tes.almoxarifadoDefaultId;
        if (tes.centroCustoSugeridoId) next.centroCustoId = tes.centroCustoSugeridoId;
        if (tes.naturezaSugeridaId && modoNatureza === "POR_ITEM") next.naturezaFinanceiraId = tes.naturezaSugeridaId;
        if (!tes.permiteCapitalizar) { next.capitaliza = false; next.imobilizadoId = ""; next.componenteSubstituidoId = ""; }
      } else { next.compoeCusto = null; }
      return next;
    }));
  }

  // Natureza global — o campo da aba Duplicatas aplica a TODAS as linhas.
  function applyNaturezaGlobal(natId: string) {
    setNaturezaFinanceiraId(natId);
    setEditItems((prev) => prev.map((i) => (i.paiId ? i : { ...i, naturezaFinanceiraId: natId })));
    setNewItems((prev) => prev.map((n) => (n.paiId || n.paiKey ? n : { ...n, naturezaFinanceiraId: natId })));
  }
  function handleModoNaturezaChange(novo: "GLOBAL" | "POR_ITEM") {
    setModoNatureza(novo);
    if (novo === "GLOBAL" && naturezaFinanceiraId) applyNaturezaGlobal(naturezaFinanceiraId);
    if (novo === "POR_ITEM") {
      const sugDoTes = (tesId: string) => tesList.find((t) => t.id === tesId)?.naturezaSugeridaId ?? "";
      setEditItems((prev) => prev.map((i) => (i.naturezaFinanceiraId || i.paiId ? i : { ...i, naturezaFinanceiraId: sugDoTes(i.tesId) })));
      setNewItems((prev) => prev.map((n) => (n.naturezaFinanceiraId || n.paiId || n.paiKey ? n : { ...n, naturezaFinanceiraId: sugDoTes(n.tesId) })));
    }
  }

  // Opções de natureza p/ a coluna por item (código + agrupadas por grupo).
  const GRUPO_NAT_LABEL: Record<string, string> = {
    RECEITA_OPERACIONAL: "Receitas operacionais", CUSTO_OPERACIONAL: "Custos operacionais",
    DESPESA_OPERACIONAL: "Despesas operacionais", INVESTIMENTO: "Atividades de investimento",
    FINANCIAMENTO: "Atividades de financiamento", MOVIMENTACAO_INTERNA: "Movimentações internas",
  };
  const naturezaOptions = [...naturezas]
    .sort((a, b) => (a.codigo ?? "9999").localeCompare(b.codigo ?? "9999") || a.nome.localeCompare(b.nome))
    .map((n) => ({ value: n.id, label: `${n.codigo ? `${n.codigo} ` : ""}${n.nome}`, group: GRUPO_NAT_LABEL[n.grupo] ?? n.grupo }));

  // Sync usuarioResponsavelId from responsavel name once users are loaded
  useEffect(() => {
    if (usuarios.length === 0 || !responsavel) return;
    const match = usuarios.find((u) => u.nome.toLowerCase() === responsavel.toLowerCase());
    if (match) setUsuarioResponsavelId(match.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarios]);

  useEffect(() => {
    fetch("/api/suprimentos/locais-estoque")
      .then((r) => r.json())
      .then((j) => setLocaisEstoque(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/suprimentos/fornecedores")
      .then((r) => r.json())
      .then((j) => setFornecedores(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/usuarios")
      .then((r) => r.json())
      .then((j) => setUsuarios(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/suprimentos/produtos")
      .then((r) => r.json())
      .then((j) => setProdutos(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
  }, []);

  function updateNewItem(key: string, field: keyof NewItem, value: string | boolean) {
    setNewItems((prev) =>
      prev.map((ni) => {
        if (ni._key !== key) return ni;
        const updated = { ...ni, [field]: value };
        // auto-calc vlrTotal
        if (field === "vlrUnitario" || field === "quantidadeRecebida" || field === "desconto") {
          const qtd  = parseFloat(field === "quantidadeRecebida" ? String(value) : ni.quantidadeRecebida) || 0;
          const unit = parseFloat(field === "vlrUnitario" ? String(value) : ni.vlrUnitario) || 0;
          const pct  = parseFloat(field === "desconto" ? String(value) : ni.desconto) || 0;
          if (qtd > 0 && unit > 0) {
            const bruto = qtd * unit;
            updated.vlrTotal = (bruto - (bruto * pct) / 100).toFixed(2);
          }
        }
        return updated;
      })
    );
  }

  function addNewItemRow(produto: ProdutoOption) {
    const tesG = modoTes === "GLOBAL" ? tesList.find((t) => t.id === tesGlobalId) : undefined;
    // Componente pendente ("+ Componente" numa linha pai): a nova linha nasce filha.
    const comp = componenteDe;
    setComponenteDe(null);
    setNewItems((prev) => [
      ...prev,
      {
        _key: `${produto.id}-${Date.now()}`,
        paiId: comp?.paiId ?? "",
        paiKey: comp?.paiKey ?? "",
        itemId: produto.id,
        codigo: produto.codigo,
        descricao: produto.descricao,
        unidadeMedida: produto.unidadeMedida,
        quantidadeRecebida: "1",
        vlrUnitario: "",
        vlrTotal: "",
        vlrIPI: "",
        vlrICMS: "",
        desconto: "",
        localEstoqueId: localEstoqueGlobalId,
        centroCustoId: modoCentro === "GLOBAL" ? centroGlobalId : "",
        naturezaFinanceiraId: modoNatureza === "GLOBAL" ? naturezaFinanceiraId : "",
        tesId: modoTes === "GLOBAL" ? tesGlobalId : "",
        compoeCusto: tesG ? tesG.compoeCusto : null,
        capitaliza: false,
        imobilizadoId: "",
        componenteSubstituidoId: "",
      },
    ]);
    setAddItemSearch("");
    setShowAddRow(false);
    // Re-show the local alert if new item has no local
    if (!localEstoqueGlobalId) setLocalAlertDismissed(false);
  }

  function removeNewItem(key: string) {
    setNewItems((prev) => prev.filter((ni) => ni._key !== key));
  }

  function updateEditItem(itemId: string, key: keyof EditItem, value: string | boolean) {
    setEditItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, [key]: value } : i)));
  }

  function handleModoChange(novo: "GLOBAL" | "POR_ITEM") {
    setModoLocalEstoque(novo);
    if (novo === "GLOBAL") {
      // propagate current global to all items
      setEditItems((prev) => prev.map((i) => ({ ...i, localEstoqueId: localEstoqueGlobalId })));
    }
  }

  function handleGlobalLocalChange(localId: string) {
    setLocalEstoqueGlobalId(localId);
    // propagate to all items immediately
    setEditItems((prev) => prev.map((i) => ({ ...i, localEstoqueId: localId })));
  }

  // TES global — aplica o preset a TODAS as linhas (mesmos efeitos do applyTesEdit).
  function applyTesGlobal(tesId: string) {
    setTesGlobalId(tesId);
    const tes = tesList.find((t) => t.id === tesId);
    const aplicar = <T extends { tesId: string; compoeCusto: boolean | null; localEstoqueId: string; centroCustoId: string; capitaliza: boolean; imobilizadoId: string; componenteSubstituidoId: string }>(i: T): T => {
      const next = { ...i, tesId };
      if (tes) {
        next.compoeCusto = tes.compoeCusto;
        if (tes.estocavel && tes.almoxarifadoDefaultId && modoLocalEstoque === "POR_ITEM") next.localEstoqueId = tes.almoxarifadoDefaultId;
        if (tes.centroCustoSugeridoId && modoCentro === "POR_ITEM") next.centroCustoId = tes.centroCustoSugeridoId;
        if (!tes.permiteCapitalizar) { next.capitaliza = false; next.imobilizadoId = ""; next.componenteSubstituidoId = ""; }
      } else { next.compoeCusto = null; }
      return next;
    };
    setEditItems((prev) => prev.map(aplicar));
    setNewItems((prev) => prev.map(aplicar));
  }
  function handleModoTesChange(novo: "GLOBAL" | "POR_ITEM") {
    setModoTes(novo);
    if (novo === "GLOBAL" && tesGlobalId) applyTesGlobal(tesGlobalId);
  }

  // Centro de custo global — aplica a todas as linhas.
  function applyCentroGlobal(ccId: string) {
    setCentroGlobalId(ccId);
    setEditItems((prev) => prev.map((i) => ({ ...i, centroCustoId: ccId })));
    setNewItems((prev) => prev.map((i) => ({ ...i, centroCustoId: ccId })));
  }
  function handleModoCentroChange(novo: "GLOBAL" | "POR_ITEM") {
    setModoCentro(novo);
    if (novo === "GLOBAL" && centroGlobalId) applyCentroGlobal(centroGlobalId);
  }

  // Auto-calc vlrTotal when vlrUnitario, quantidadeRecebida, or desconto changes
  function updateItemAndCalc(itemId: string, key: "vlrUnitario" | "quantidadeRecebida" | "desconto", value: string) {
    setEditItems((prev) =>
      prev.map((i) => {
        if (i.id !== itemId) return i;
        const updated = { ...i, [key]: value };
        const qtd  = parseFloat(key === "quantidadeRecebida" ? value : i.quantidadeRecebida) || 0;
        const unit = parseFloat(key === "vlrUnitario" ? value : i.vlrUnitario) || 0;
        const pct  = parseFloat(key === "desconto" ? value : i.desconto) || 0;
        if (qtd > 0 && unit > 0) {
          const bruto = qtd * unit;
          updated.vlrTotal = (bruto - (bruto * pct) / 100).toFixed(2);
        }
        return updated;
      })
    );
  }

  // Retorna true quando salvou com sucesso — a conclusão depende disso para não
  // concluir com dados desatualizados (ex.: condição de pagamento não persistida).
  async function salvarConferencia(): Promise<boolean> {
    setValidationError("");
    if (!fornecedorId) { setValidationError("Fornecedor é obrigatório."); return false; }
    if (!tipoNota)     { setValidationError("Tipo é obrigatório."); return false; }
    if (!dtEmissao)    { setValidationError("DT Emissão é obrigatória."); return false; }
    if (modoLocalEstoque === "GLOBAL" && !localEstoqueGlobalId) {
      setValidationError("Local de Estoque é obrigatório."); return false;
    }
    if (modoLocalEstoque === "POR_ITEM") {
      // Componentes (filhos) não entram no estoque — sem local obrigatório.
      const allItems = [
        ...editItems.filter((i) => !i.paiId),
        ...newItems.filter((i) => !i.paiId && !i.paiKey),
      ];
      const semLocal = allItems.some((i) => !i.localEstoqueId);
      if (semLocal) { setValidationError("Todos os itens precisam ter um Local de Estoque definido."); return false; }
    }
    // TES e centro de custo são obrigatórios por item — COMPONENTES (filhos)
    // ficam de fora: não movimentam estoque nem custo (decompõem o preço do pai).
    const ehComponenteEdit = (i: EditItem) => !!i.paiId;
    const ehComponenteNew = (i: NewItem) => !!i.paiId || !!i.paiKey;
    const todosItens = [
      ...editItems.filter((i) => !ehComponenteEdit(i)),
      ...newItems.filter((i) => !ehComponenteNew(i)),
    ];
    if (todosItens.some((i) => !i.tesId)) { setValidationError("Selecione o TES em cada item."); return false; }
    if (todosItens.some((i) => !i.centroCustoId)) { setValidationError("Informe o centro de custo em cada item."); return false; }
    // Capex: linha que capitaliza exige o bem (imobilizado).
    if (todosItens.some((i) => i.capitaliza && !i.imobilizadoId)) {
      setValidationError("Item que capitaliza exige o bem (imobilizado)."); return false;
    }

    setSaving(true);
    setActionError("");
    try {
      const res = await fetch(`/api/suprimentos/conferencias/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornecedorId: fornecedorId || null,
          localEstoqueId: modoLocalEstoque === "GLOBAL" ? (localEstoqueGlobalId || null) : null,
          modoLocalEstoque,
          observacoes: observacoes || null,
          tipoNota: tipoNota || null,
          numeroNF: numeroNF || null,
          serie: serie || null,
          dtEmissao: dtEmissao || null,
          ufOrigem: ufOrigem || null,
          espDocumento: espDocumento || null,
          frete: frete ? parseFloat(frete) : null,
          seguro: seguro ? parseFloat(seguro) : null,
          despesas: despesas ? parseFloat(despesas) : null,
          desconto: desconto ? parseFloat(desconto) : null,
          condicaoPagamentoId: condicaoPagamentoId || null,
          formaPagamentoId: formaPagamentoId || null,
          naturezaFinanceiraId: naturezaFinanceiraId || null,
          valorPagoAntecipado: valorPagoAntecipado ? parseFloat(valorPagoAntecipado) : null,
          dataPagoAntecipado: valorPagoAntecipado ? (dataPagoAntecipado || null) : null,
          formaPagoAntecipadoId: valorPagoAntecipado ? (formaPagoAntecipadoId || null) : null,
          contaPagoAntecipadoId: valorPagoAntecipado ? (contaPagoAntecipadoId || null) : null,
          parcelasCustom: parcelasCustom && parcelasCustom.length > 0 ? parcelasCustom : null,
          itens: [
            ...editItems.map((i) => ({
              id: i.id,
              unidadeId: i.unidadeId || null,
              quantidadeRecebida: parseFloat(i.quantidadeRecebida) || 0,
              observacao: i.observacao || null,
              vlrUnitario: i.vlrUnitario ? parseFloat(i.vlrUnitario) : null,
              vlrTotal: i.vlrTotal ? parseFloat(i.vlrTotal) : null,
              vlrIPI: i.vlrIPI ? parseFloat(i.vlrIPI) : null,
              vlrICMS: i.vlrICMS ? parseFloat(i.vlrICMS) : null,
              tipoEntrada: i.tipoEntrada || null,
              codFiscal: i.codFiscal || null,
              tpOper: i.tpOper || null,
              localEstoqueId: i.localEstoqueId || null,
              centroCustoId: i.centroCustoId || null,
              tesId: i.tesId || null,
              naturezaFinanceiraId: i.paiId ? null : (i.naturezaFinanceiraId || null),
              compoeCusto: i.compoeCusto,
              capitaliza: i.capitaliza ? true : null,
              imobilizadoId: i.capitaliza ? (i.imobilizadoId || null) : null,
              componenteSubstituidoId: i.capitaliza ? (i.componenteSubstituidoId || null) : null,
              desconto: i.desconto ? parseFloat(i.desconto) : null,
            })),
            // new items (no id — will be created by API). Componente de item novo
            // usa paiIndex (posição do pai NO PAYLOAD: editItems primeiro).
            ...newItems.map((ni) => ({
              itemId: ni.itemId,
              paiId: ni.paiId || undefined,
              paiIndex: ni.paiKey
                ? editItems.length + newItems.findIndex((x) => x._key === ni.paiKey)
                : undefined,
              quantidadePedida: parseFloat(ni.quantidadeRecebida) || 0,
              quantidadeRecebida: parseFloat(ni.quantidadeRecebida) || 0,
              vlrUnitario: ni.vlrUnitario ? parseFloat(ni.vlrUnitario) : null,
              vlrTotal: ni.vlrTotal ? parseFloat(ni.vlrTotal) : null,
              vlrIPI: ni.vlrIPI ? parseFloat(ni.vlrIPI) : null,
              vlrICMS: ni.vlrICMS ? parseFloat(ni.vlrICMS) : null,
              desconto: ni.desconto ? parseFloat(ni.desconto) : null,
              localEstoqueId: ni.localEstoqueId || null,
              centroCustoId: ni.centroCustoId || null,
              tesId: ni.tesId || null,
              naturezaFinanceiraId: ni.paiId || ni.paiKey ? null : (ni.naturezaFinanceiraId || null),
              compoeCusto: ni.compoeCusto,
              capitaliza: ni.capitaliza ? true : null,
              imobilizadoId: ni.capitaliza ? (ni.imobilizadoId || null) : null,
              componenteSubstituidoId: ni.capitaliza ? (ni.componenteSubstituidoId || null) : null,
            })),
          ],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || "Erro ao salvar");
        return false;
      }
      setNewItems([]); // clear pending new items after save
      await load();
      setModoEdicao(false); // salvou → volta ao modo detalhes
      return true;
    } catch {
      setActionError("Erro de conexão");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function concluir() {
    setActionError("");

    // ── Pré-verificação: novos vínculos fornecedor × produto ──────────────────
    // fornecedorId: vem do pedido vinculado ou do fornecedor direto da conferência, ou do estado do formulário
    const fornecedorIdCheck = conferencia?.pedido?.fornecedor?.id ?? conferencia?.fornecedor?.id ?? fornecedorId;
    // Cruzar editItems (que tem quantidadeRecebida) com conferencia.itens (que tem item.id)
    const itensComRecebimento = (conferencia?.itens ?? []).filter((ci) => {
      const ei = editItems.find((e) => e.id === ci.id);
      return parseFloat(String(ei?.quantidadeRecebida ?? ci.quantidadeRecebida ?? 0)) > 0;
    });
    if (fornecedorIdCheck && itensComRecebimento.length > 0) {
      try {
        const itemIds = itensComRecebimento.map((ci) => ci.item.id).join(",");
        const checkRes = await fetch(
          `/api/suprimentos/fornecedor-vinculos-check?fornecedorId=${fornecedorIdCheck}&itemIds=${encodeURIComponent(itemIds)}`
        );
        if (checkRes.ok) {
          const { novos } = await checkRes.json() as { novos: VinculoItem[] };
          if (novos?.length > 0) {
            const fornInfo2 = conferencia?.pedido?.fornecedor ?? conferencia?.fornecedor;
            const fornNome = fornInfo2?.nomeFantasia || fornInfo2?.razaoSocial || "fornecedor";
            setVinculoPopup({ fornecedorNome: String(fornNome), novos });
            return; // aguarda confirmação
          }
        }
      } catch { /* ignora erros de verificação */ }
    }

    await doConcluir();
  }

  async function doConcluir() {
    setVinculoPopup(null);
    setActioning(true);
    setActionError("");
    try {
      // Persiste o formulário ANTES de concluir. Se o salvar falhar (validação
      // ou erro de rede), aborta — concluir com dados antigos gerava títulos
      // com a condição de pagamento errada (ex.: à vista em vez de parcelado).
      const salvou = await salvarConferencia();
      if (!salvou) return;

      const res = await fetch(`/api/suprimentos/conferencias/${id}/concluir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsavel }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || "Erro ao concluir");
        return;
      }
      await load();
      if (json.scAtualizadas?.length > 0) {
        setScAtendidaMsg(json.scAtualizadas);
        setTimeout(() => setScAtendidaMsg(null), 10000);
      }
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  async function iniciarConferencia() {
    setActioning(true);
    setActionError("");
    try {
      const res = await fetch(`/api/suprimentos/conferencias/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: [] }),
      });
      if (!res.ok) {
        const j = await res.json();
        setActionError(j.error || "Erro ao iniciar");
        return;
      }
      await load();
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/suprimentos/conferencias/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error || "Erro ao excluir"); setDeleting(false); setConfirmDelete(false); return; }
      router.push("/suprimentos/conferencias");
    } catch {
      setActionError("Erro de conexão");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  useTabTitle(conferencia ? `Doc. ${conferencia.numero}` : null);

  if (loading) return <div className="px-8 pt-8 text-muted-foreground">Carregando...</div>;
  if (!conferencia) return <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>;

  const isPendente    = conferencia.status === "PENDENTE";
  const isEditable    = conferencia.status === "EM_CONFERENCIA";
  const isDivergencia = conferencia.status === "DIVERGENCIA";
  const isConcluded   = conferencia.status === "CONCLUIDA";
  // Divergência é re-editável por qualquer usuário; Concluída só por admin.
  // O status permite editar, mas os campos só destravam no modo edição (botão Editar).
  const canEditStatus = isPendente || isEditable || isDivergencia || (isConcluded && isAdmin);
  const canEdit       = canEditStatus && modoEdicao;
  const nfEditable    = canEdit;
  const isSN = tipoNota === "SN";
  const itemsEditable = (isEditable || isDivergencia || (isConcluded && isAdmin)) && modoEdicao;

  // Detect missing local de estoque (only relevant while editable)
  const missingLocalGlobal = itemsEditable && modoLocalEstoque === "GLOBAL" && !localEstoqueGlobalId;
  const missingLocalPorItem = itemsEditable && modoLocalEstoque === "POR_ITEM" &&
    [...editItems.filter((i) => !i.paiId), ...newItems.filter((i) => !i.paiId && !i.paiKey)].some((i) => !i.localEstoqueId);
  const showLocalAlert = (missingLocalGlobal || missingLocalPorItem) && !localAlertDismissed;

  const hasDivergencias = editItems.some((ei) => {
    const item = conferencia.itens.find((i) => i.id === ei.id);
    if (!item) return false;
    return Math.abs(decimalToNumber(item.quantidadePedida) - (parseFloat(ei.quantidadeRecebida) || 0)) > 0.001;
  });

  // Fornecedor info: prefer standalone fornecedor, fallback to pedido.fornecedor
  const fornInfo: FornecedorInfo | null = conferencia.fornecedor ?? conferencia.pedido?.fornecedor ?? null;
  const fornNome = fornInfo ? (fornInfo.nomeFantasia || fornInfo.razaoSocial) : "—";

  // Totals — COMPONENTES (filhos) fora: decompõem o preço do pai.
  const editSemFilhos = editItems.filter((i) => !i.paiId);
  const confSemFilhos = conferencia.itens.filter((i) => !i.paiId);
  const vlrMercadoria = itemsEditable
    ? editSemFilhos.reduce((s, i) => s + (parseFloat(i.vlrTotal) || 0), 0)
      + newItems.filter((n) => !n.paiId && !n.paiKey).reduce((s, n) => s + (parseFloat(n.vlrTotal) || 0), 0)
    : confSemFilhos.reduce((s, i) => s + decimalToNumber(i.vlrTotal), 0);
  const descontoTotalItens = itemsEditable
    ? editSemFilhos.reduce((s, ei) => {
        const unit = parseFloat(ei.vlrUnitario) || 0;
        const qtd  = parseFloat(ei.quantidadeRecebida) || 0;
        const pct  = parseFloat(ei.desconto) || 0;
        return s + (unit * qtd * pct) / 100;
      }, 0)
    : confSemFilhos.reduce((s, i) => {
        const unit = decimalToNumber(i.vlrUnitario);
        const qtd  = decimalToNumber(i.quantidadeRecebida);
        const pct  = decimalToNumber(i.desconto);
        return s + (unit * qtd * pct) / 100;
      }, 0);
  const freteNum = decimalToNumber(conferencia.frete);
  const seguroNum = decimalToNumber(conferencia.seguro);
  const despesasNum = decimalToNumber(conferencia.despesas);
  const descontoNum = decimalToNumber(conferencia.desconto);
  const vrTotalNum = decimalToNumber(conferencia.vrTotal);
  // Encargos/desconto herdados do PEDIDO, rateados pela fração em valor — mesma
  // regra do encargosConferencia (lib), que define o crédito ao fornecedor e o
  // contas a pagar. Só valem quando o DE não tem frete/desconto próprios.
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const pedidoDE = conferencia.pedido;
  const subtotalPedido = confSemFilhos.reduce(
    (s, i) => s + decimalToNumber(i.quantidadePedida) * decimalToNumber(i.vlrUnitario), 0);
  const fracPedido = subtotalPedido > 0 ? Math.min(vlrMercadoria / subtotalPedido, 1) : 0;
  const herdaDoPedido = freteNum <= 0 && descontoNum <= 0 && !!pedidoDE;
  const freteHerdado = herdaDoPedido && pedidoDE
    ? r2((decimalToNumber(pedidoDE.frete) + decimalToNumber(pedidoDE.seguro) + decimalToNumber(pedidoDE.despesas)) * fracPedido)
    : 0;
  const descontoHerdado = herdaDoPedido && pedidoDE ? r2(decimalToNumber(pedidoDE.vrDesconto) * fracPedido) : 0;
  const vlrLiquido = vrTotalNum > 0
    ? vrTotalNum
    : r2(vlrMercadoria + freteNum + seguroNum + despesasNum - descontoNum + freteHerdado - descontoHerdado);

  // ── Duplicatas ──────────────────────────────────────────────────────────
  // Títulos reais já gerados (dedup entre os da conferência e os do pedido — PA).
  const titulosReais: TituloResumo[] = (() => {
    const vistos = new Set<string>();
    const out: TituloResumo[] = [];
    for (const t of [...(conferencia.contasPagar ?? []), ...(conferencia.pedido?.contasPagar ?? [])]) {
      if (vistos.has(t.id)) continue;
      vistos.add(t.id);
      out.push(t);
    }
    return out;
  })();

  // Prévia das parcelas (antes de concluir) — replica a precedência do servidor.
  // Cálculo direto (não useMemo): este ponto está DEPOIS dos early returns de
  // loading/erro, então um hook aqui quebraria as regras de hooks do React.
  const duplicatasPreview = (() => {
    const itensPreview = itemsEditable
      ? [...editItems, ...newItems].map((ei) => ({
          vlrTotal: parseFloat(ei.vlrTotal) || 0,
          quantidadeRecebida: parseFloat(ei.quantidadeRecebida) || 0,
          vlrUnitario: parseFloat(ei.vlrUnitario) || 0,
          desconto: parseFloat(ei.desconto) || 0,
          filho: "paiKey" in ei ? !!(ei.paiId || (ei as NewItem).paiKey) : !!ei.paiId,
        }))
      : conferencia.itens.map((i) => ({
          vlrTotal: decimalToNumber(i.vlrTotal) || 0,
          quantidadeRecebida: decimalToNumber(i.quantidadeRecebida),
          vlrUnitario: decimalToNumber(i.vlrUnitario),
          desconto: decimalToNumber(i.desconto),
          filho: !!i.paiId,
        }));
    const ped = conferencia.pedido;
    return previewDuplicatasDE({
      itens: itensPreview,
      vrTotalNF: vrTotalNum,
      freteDE: freteNum,
      descontoDE: descontoNum,
      pedido: ped
        ? {
            frete: decimalToNumber(ped.frete),
            seguro: decimalToNumber(ped.seguro),
            despesas: decimalToNumber(ped.despesas),
            vrDesconto: decimalToNumber(ped.vrDesconto),
            subtotalItens: (ped.itens ?? []).reduce((s, it) => s + decimalToNumber(it.valorTotal), 0),
            valorTotal: decimalToNumber(ped.valorTotal),
            intragrupo: !!ped.intragrupo,
            condicaoPagamentoId: ped.condicaoPagamentoId,
            condicoesPagamento: ped.condicoesPagamento,
          }
        : null,
      temFornecedor: !!fornecedorId,
      condicaoIdDE: condicaoPagamentoId || null,
      condicoes,
      dtEmissao: dtEmissao || null,
      valorPagoAntecipado: parseFloat(valorPagoAntecipado) || 0,
      dataPagoAntecipado: dataPagoAntecipado || null,
      parcelasCustom,
    });
  })();

  const condicaoNomeAtual = condicoes.find((c) => c.id === condicaoPagamentoId)?.nome
    ?? duplicatasPreview.condicao?.nome ?? null;

  return (
    <div>
      {/* SC atendida toast */}
      {scAtendidaMsg && scAtendidaMsg.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 max-w-lg w-full px-4">
          <div className="flex items-start gap-3 bg-blue-700 text-white text-sm px-5 py-4 rounded-2xl shadow-lg">
            <div className="flex-1">
              <p className="font-semibold mb-1">
                {scAtendidaMsg.length === 1
                  ? "Solicitação de Compras atualizada"
                  : `${scAtendidaMsg.length} Solicitações de Compras atualizadas`}
              </p>
              <ul className="space-y-0.5">
                {scAtendidaMsg.map((sc) => (
                  <li key={sc.numero} className="flex items-center gap-2 text-blue-100">
                    <span className="font-mono font-bold text-white">{sc.numero}</span>
                    <span>→</span>
                    <span className={sc.status === "TOTALMENTE_ATENDIDA" ? "text-emerald-300 font-medium" : "text-amber-300 font-medium"}>
                      {sc.status === "TOTALMENTE_ATENDIDA" ? "Totalmente Atendida" : "Parcialmente Atendida"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <button onClick={() => setScAtendidaMsg(null)} className="opacity-70 hover:opacity-100 shrink-0 mt-0.5">✕</button>
          </div>
        </div>
      )}

      {/* Auto-vínculo toast */}
      {autoVinculoMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-emerald-700 text-white text-sm px-5 py-3 rounded-2xl shadow-lg max-w-lg">
          <span>{autoVinculoMsg}</span>
          <button onClick={() => setAutoVinculoMsg(null)} className="ml-1 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Local de Estoque — pop-up de aviso ──────────────────────────────── */}
      {showLocalAlert && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/30">
          <div className="bg-card rounded-2xl shadow-2xl border border-danger/30 max-w-md w-full mx-4 p-6">
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-10 h-10 bg-danger/15 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground mb-1">Local de Estoque obrigatório</h3>
                <p className="text-sm text-muted-foreground">
                  {modoLocalEstoque === "GLOBAL"
                    ? "Selecione o Local de Estoque antes de salvar ou concluir este documento."
                    : "Um ou mais itens não possuem Local de Estoque definido. Preencha o campo antes de salvar ou concluir."}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setLocalAlertDismissed(true)}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmação de Divergência ──────────────────────────────────────── */}
      {showDivergenciaConfirm && (() => {
        const divergentItems = conferencia.itens
          .map((item, idx) => {
            const ei = editItems[idx];
            const pedida   = decimalToNumber(item.quantidadePedida);
            const recebida = parseFloat(ei?.quantidadeRecebida ?? "0") || 0;
            if (Math.abs(pedida - recebida) > 0.001) {
              return { codigo: item.item.codigo, descricao: item.item.descricao, unidade: item.item.unidadeMedida, pedida, recebida };
            }
            return null;
          })
          .filter(Boolean) as { codigo: string; descricao: string; unidade: string; pedida: number; recebida: number }[];

        return (
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/30">
            <div className="bg-card rounded-2xl shadow-2xl border border-warning/30 max-w-lg w-full mx-4 p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="shrink-0 w-10 h-10 bg-warning/15 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground mb-1">Divergência de quantidades</h3>
                  <p className="text-sm text-muted-foreground">
                    {divergentItems.length === 1
                      ? "O item abaixo foi recebido em quantidade diferente da pedida."
                      : `Os ${divergentItems.length} itens abaixo foram recebidos em quantidades diferentes das pedidas.`}
                    {" "}O documento será concluído com status <span className="font-semibold text-warning">Divergência</span>.
                  </p>
                </div>
              </div>

              {/* Tabela de itens divergentes */}
              <div className="rounded-lg border border-border overflow-hidden mb-5">
                <table className="w-full text-xs">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Produto</th>
                      <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Qtd. Pedida</th>
                      <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Qtd. Recebida</th>
                      <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Diferença</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {divergentItems.map((it) => (
                      <tr key={it.codigo}>
                        <td className="px-2 py-1.5">
                          <span className="font-mono text-muted-foreground mr-1.5">{it.codigo}</span>
                          <span className="text-foreground">{it.descricao}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">
                          {it.pedida.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {it.unidade}
                        </td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">
                          {it.recebida.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {it.unidade}
                        </td>
                        <td className={`px-2 py-1.5 text-right font-semibold ${it.recebida < it.pedida ? "text-danger" : "text-success"}`}>
                          {it.recebida > it.pedida ? "+" : ""}
                          {(it.recebida - it.pedida).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {it.unidade}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDivergenciaConfirm(false)}
                  className="px-4 py-2 border border-border text-muted-foreground text-sm font-medium rounded-lg hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setShowDivergenciaConfirm(false);
                    concluir();
                  }}
                  disabled={actioning}
                  className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-60"
                >
                  {actioning ? "Concluindo..." : "Confirmar mesmo assim"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <PageHeader
        title={`Documento de Entrada ${conferencia.numero}`}
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Doc. de Entrada", href: "/suprimentos/conferencias" },
          { label: conferencia.numero },
        ]}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={conferencia.status} />
            {canEditStatus && !modoEdicao && (
              <Button size="sm" onClick={() => setModoEdicao(true)}>
                <Pencil className="w-4 h-4 mr-1.5" />Editar
              </Button>
            )}
            {modoEdicao && (
              <>
                <Button size="sm" onClick={salvarConferencia} disabled={saving}>
                  {saving
                    ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Salvando...</>
                    : <><Save className="w-4 h-4 mr-1.5" />Salvar</>
                  }
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setModoEdicao(false); setValidationError(""); load(); }}
                  disabled={saving}
                >
                  Cancelar
                </Button>
              </>
            )}
            {!confirmDelete ? (
              <Button
                size="sm"
                variant="outline"
                className="text-danger border-danger/30 hover:bg-danger/10 hover:text-danger"
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Excluir
              </Button>
            ) : (
              <div className="flex items-center gap-1.5 bg-danger/10 border border-danger/30 rounded-lg px-3 py-1.5">
                <span className="text-xs text-danger font-medium">Confirmar exclusão?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded"
                >
                  {deleting ? "..." : "Sim"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-red-500 hover:text-danger px-1"
                >
                  Não
                </button>
              </div>
            )}
          </div>
        }
      />

      <div className="px-6 pb-6 space-y-4">
        {(actionError || validationError) && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">
            {validationError || actionError}
          </div>
        )}

        {/* ── Banner: modo edição administrativa ───────────────────────────── */}
        {isConcluded && isAdmin && (
          <div className="flex items-center gap-2 bg-warning/10 border border-warning/30 text-warning px-4 py-2.5 rounded-xl text-sm">
            <ShieldAlert className="w-4 h-4 text-warning shrink-0" />
            <span className="font-medium">Modo edição administrativa</span>
            <span className="text-warning">— alterações salvas substituirão os dados do documento concluído.</span>
          </div>
        )}

        {/* ── Seção 1: Dados do Documento ───────────────────────────────────── */}
        <Card size="sm">
          <CardHeader className="pb-1">
            <CardTitle className="text-base">Dados do Documento</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2.5">

            {/* Tipo de Documento */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tipo de Documento <span className="text-red-500">*</span></Label>
              {nfEditable ? (
                <select
                  value={tipoNota}
                  onChange={(e) => setTipoNota(e.target.value)}
                  className="w-full h-9 px-3 border border-border rounded-md text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="NF">NF — Nota Fiscal</option>
                  <option value="SN">SN — Sem Nota</option>
                </select>
              ) : (
                <Input
                  value={tipoNota === "SN" ? "SN — Sem Nota" : "NF — Nota Fiscal"}
                  readOnly
                  className="bg-muted"
                />
              )}
            </div>

            {/* Número NF */}
            <div className="space-y-1.5">
              <Label className={cn("text-xs", isSN ? "text-muted-foreground/60" : "text-muted-foreground")}>
                Número NF{isSN && <span className="ml-1 text-[10px] italic">(não obrigatório)</span>}
              </Label>
              {nfEditable ? (
                <Input
                  value={isSN ? "" : numeroNF}
                  onChange={(e) => setNumeroNF(e.target.value)}
                  placeholder={isSN ? "—" : "000000"}
                  disabled={isSN}
                  className={isSN ? "bg-muted text-muted-foreground/60 cursor-not-allowed" : ""}
                />
              ) : (
                <Input value={conferencia.numeroNF ?? "—"} readOnly className="bg-muted" />
              )}
            </div>

            {/* Série */}
            <div className="space-y-1.5">
              <Label className={cn("text-xs", isSN ? "text-muted-foreground/60" : "text-muted-foreground")}>
                Série{isSN && <span className="ml-1 text-[10px] italic">(não obrigatório)</span>}
              </Label>
              {nfEditable ? (
                <Input
                  value={isSN ? "" : serie}
                  onChange={(e) => setSerie(e.target.value)}
                  placeholder={isSN ? "—" : "1"}
                  disabled={isSN}
                  className={isSN ? "bg-muted text-muted-foreground/60 cursor-not-allowed" : ""}
                />
              ) : (
                <Input value={conferencia.serie ?? "—"} readOnly className="bg-muted" />
              )}
            </div>

            {/* DT Emissão */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">DT Emissão <span className="text-red-500">*</span></Label>
              {nfEditable ? (
                <DatePicker
                  value={dtEmissao}
                  onChange={(v) => setDtEmissao(v)}
                />
              ) : (
                <Input
                  value={conferencia.dtEmissao ? formatDate(conferencia.dtEmissao) : "—"}
                  readOnly
                  className="bg-muted"
                />
              )}
            </div>

            {/* Espécie de Documento */}
            <div className="space-y-1.5">
              <Label className={cn("text-xs", isSN ? "text-muted-foreground/60" : "text-muted-foreground")}>
                Espécie de Documento{isSN && <span className="ml-1 text-[10px] italic">(não obrigatório)</span>}
              </Label>
              {nfEditable ? (
                <Input
                  value={isSN ? "" : espDocumento}
                  onChange={(e) => setEspDocumento(e.target.value)}
                  placeholder={isSN ? "—" : "SPED"}
                  disabled={isSN}
                  className={isSN ? "bg-muted text-muted-foreground/60 cursor-not-allowed" : ""}
                />
              ) : (
                <Input value={conferencia.espDocumento ?? "—"} readOnly className="bg-muted" />
              )}
            </div>

            {/* UF Origem */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">UF Origem</Label>
              {nfEditable ? (
                <ComboboxWithCreate
                  value={ufOrigem}
                  onChange={(v) => setUfOrigem(v)}
                  noneLabel="—"
                  triggerClassName="h-9 rounded-md"
                  options={UF_LIST.map((uf) => ({ value: uf, label: uf }))}
                />
              ) : (
                <Input value={conferencia.ufOrigem ?? "—"} readOnly className="bg-muted" />
              )}
            </div>

            {/* Loja */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Loja</Label>
              <Input value="01" readOnly className="bg-muted" />
            </div>

            {/* Nº Documento (read-only) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nº Documento</Label>
              <Input value={conferencia.numero} readOnly className="bg-muted font-mono text-xs" />
            </div>

            {/* Data Conferência (read-only) */}
            {conferencia.dataConferencia && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Data Conferência</Label>
                <Input
                  value={formatDate(conferencia.dataConferencia)}
                  readOnly
                  className="bg-muted"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Seção 2: Fornecedor ───────────────────────────────────────────── */}
        <Card size="sm">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Fornecedor</CardTitle>
              {conferencia.pedido && (
                <Link
                  href={`/suprimentos/pedidos-compra/${conferencia.pedido.id}`}
                  className="text-xs text-info hover:underline font-mono"
                >
                  Pedido vinculado: {conferencia.pedido.numero}
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-x-4 gap-y-2.5">
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs text-muted-foreground">
                  Fornecedor <span className="text-red-500">*</span>
                </Label>
                {nfEditable ? (
                  <ComboboxWithCreate
                    options={fornecedores.map((f) => ({
                      value: f.id,
                      label: f.nomeFantasia || f.razaoSocial,
                      code: f.cpfCnpj ?? undefined,
                    }))}
                    value={fornecedorId}
                    onChange={setFornecedorId}
                    allowNone={false}
                    placeholder="Selecionar fornecedor..."
                    createHref="/suprimentos/fornecedores/novo"
                    createLabel="fornecedor"
                  />
                ) : (
                  <Input value={fornNome} readOnly className="bg-muted" />
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">CNPJ</Label>
                <Input
                  value={
                    nfEditable
                      ? (fornecedores.find((f) => f.id === fornecedorId)?.cpfCnpj ?? (fornInfo?.cpfCnpj ?? "—"))
                      : (fornInfo?.cpfCnpj ?? "—")
                  }
                  readOnly
                  className="bg-muted font-mono text-xs"
                />
              </div>
              {fornInfo?.contato && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Contato</Label>
                  <Input value={fornInfo.contato} readOnly className="bg-muted" />
                </div>
              )}
              {fornInfo?.email && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">E-mail</Label>
                  <Input value={fornInfo.email} readOnly className="bg-muted" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Itens ────────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
              <CardTitle className="text-base">Itens</CardTitle>

              <div className="ml-auto flex items-center gap-x-4 gap-y-2 flex-wrap">
                {/* TES — modo Global/Por Item */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">TES:</span>
                  <ModoToggle value={modoTes} onChange={handleModoTesChange} editable={itemsEditable} />
                  {modoTes === "GLOBAL" && (
                    itemsEditable ? (
                      <div className="w-64">
                        <ComboboxWithCreate
                          value={tesGlobalId}
                          onChange={applyTesGlobal}
                          noneLabel="— TES —"
                          menuMinWidth={420}
                          triggerClassName={cn("h-8 rounded-md text-xs", !tesGlobalId && "border-red-300")}
                          options={tesList.map((t) => ({ value: t.id, label: `${t.codigo} ${t.nome}` }))}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-foreground">{tesList.find((t) => t.id === tesGlobalId)?.codigo ?? "—"}</span>
                    )
                  )}
                </div>

                {/* Centro de custo — modo Global/Por Item */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Centro:</span>
                  <ModoToggle value={modoCentro} onChange={handleModoCentroChange} editable={itemsEditable} />
                  {modoCentro === "GLOBAL" && (
                    itemsEditable ? (
                      <div className="w-64">
                        <ComboboxWithCreate
                          value={centroGlobalId}
                          onChange={applyCentroGlobal}
                          noneLabel="—"
                          menuMinWidth={420}
                          triggerClassName={cn("h-8 rounded-md text-xs", !centroGlobalId && "border-red-300")}
                          options={[...centrosCusto].sort((a, b) => (a.grupoCentroCusto?.nome ?? "ZZZ").localeCompare(b.grupoCentroCusto?.nome ?? "ZZZ") || a.codigo.localeCompare(b.codigo, undefined, { numeric: true })).map((cc) => ({ value: cc.id, label: `${cc.codigo} - ${cc.nome}`, group: cc.grupoCentroCusto?.nome ?? "Sem grupo" }))}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-foreground">{centrosCusto.find((c) => c.id === centroGlobalId)?.codigo ?? "—"}</span>
                    )
                  )}
                </div>

                {/* Natureza financeira — modo Global/Por Item (default do TES) */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Natureza:</span>
                  <ModoToggle value={modoNatureza} onChange={handleModoNaturezaChange} editable={itemsEditable} />
                  {modoNatureza === "GLOBAL" && (
                    itemsEditable ? (
                      <div className="w-64">
                        <ComboboxWithCreate
                          value={naturezaFinanceiraId}
                          onChange={applyNaturezaGlobal}
                          noneLabel="— Natureza —"
                          menuMinWidth={420}
                          triggerClassName="h-8 rounded-md text-xs"
                          options={naturezaOptions}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-foreground max-w-[10rem] truncate">{naturezas.find((n) => n.id === naturezaFinanceiraId)?.nome ?? "—"}</span>
                    )
                  )}
                </div>

                {/* Local de Estoque — modo Global/Por Item */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Local:</span>
                  <ModoToggle value={modoLocalEstoque} onChange={handleModoChange} editable={nfEditable} />
                  {modoLocalEstoque === "GLOBAL" && (
                    <div className="w-64">
                      {nfEditable ? (
                        <ComboboxWithCreate
                          value={localEstoqueGlobalId}
                          onChange={(v) => handleGlobalLocalChange(v)}
                          placeholder="Selecionar local..."
                          noneLabel="Selecionar local..."
                          menuMinWidth={360}
                          triggerClassName={cn("h-8 rounded-md text-xs", !localEstoqueGlobalId && "border-red-300")}
                          options={locaisEstoque.map((l) => ({ value: l.id, label: l.nome }))}
                        />
                      ) : (
                        <Input
                          value={locaisEstoque.find((l) => l.id === localEstoqueGlobalId)?.nome ?? "—"}
                          readOnly
                          className="bg-muted h-8 text-xs"
                        />
                      )}
                    </div>
                  )}
                </div>

                {itemsEditable && (
                  <button
                    type="button"
                    onClick={() => { setComponenteDe(null); setShowAddRow((v) => !v); }}
                    className="flex items-center gap-1.5 text-xs font-medium text-info hover:text-info transition-colors"
                  >
                    <span className="text-base leading-none">+</span> Adicionar item
                  </button>
                )}
              </div>
            </div>
          </CardHeader>
          {/* ── Busca de produto para adicionar ──────────────────────────── */}
          {itemsEditable && showAddRow && (() => {
            const q = addItemSearch.toLowerCase().trim();
            const filteredProdutos = q
              ? produtos.filter((p) => p.descricao.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)).slice(0, 10)
              : [];
            return (
              <div className="px-4 py-3 border-b border-border bg-info/10">
                {componenteDe && (
                  <p className="mb-1.5 text-xs text-muted-foreground">
                    Adicionando <b>componente</b> de <b>{componenteDe.descricao}</b> — decompõe o preço do pai, não movimenta estoque.
                    <button type="button" className="ml-2 text-info hover:underline" onClick={() => setComponenteDe(null)}>cancelar</button>
                  </p>
                )}
                <div className="relative max-w-sm">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Buscar produto por código ou descrição..."
                    value={addItemSearch}
                    onChange={(e) => setAddItemSearch(e.target.value)}
                    className="w-full h-8 px-3 border border-border rounded-md text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {filteredProdutos.length > 0 && (
                    <div className="absolute top-9 left-0 z-50 w-full bg-card border border-border rounded-xl shadow-lg max-h-52 overflow-y-auto">
                      {filteredProdutos.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-left px-2 py-1.5 hover:bg-info/10 flex items-center gap-2 text-sm"
                          onClick={() => addNewItemRow(p)}
                        >
                          <span className="font-mono text-xs text-muted-foreground shrink-0">{p.codigo}</span>
                          <span className="text-foreground">{p.descricao}</span>
                          <span className="ml-auto text-xs text-muted-foreground shrink-0">{p.unidadeMedida}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {q && filteredProdutos.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">Nenhum produto encontrado.</p>
                  )}
                </div>
              </div>
            );
          })()}
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium text-muted-foreground text-xs">#NF</th>
                    <th className="text-left px-2 py-2 font-medium text-muted-foreground text-xs">Produto</th>
                    <th className="text-left px-2 py-2 font-medium text-muted-foreground text-xs">Descrição</th>
                    {modoTes === "POR_ITEM" && (
                      <th className="text-left px-2 py-2 font-medium text-muted-foreground text-xs" title="TES: preset de comportamento que preenche as flags da linha. Não decide destino.">TES</th>
                    )}
                    {modoLocalEstoque === "POR_ITEM" && (
                      <th className="text-left px-2 py-2 font-medium text-muted-foreground text-xs">Local Estoque</th>
                    )}
                    {modoCentro === "POR_ITEM" && (
                      <th className="text-left px-2 py-2 font-medium text-muted-foreground text-xs" title="Centro herdado do pedido (default editável). Não classifica destino de custo.">Centro de custo</th>
                    )}
                    {modoNatureza === "POR_ITEM" && (
                      <th className="text-left px-2 py-2 font-medium text-muted-foreground text-xs" title="Natureza financeira da linha (classificação gerencial do título — rateio automático). Default: sugestão do TES.">Natureza</th>
                    )}
                    <th className="text-center px-2 py-2 font-medium text-muted-foreground text-xs" title="Capitaliza (imobilizado): marca a linha como capex e exige o bem. Herança/orçamento na entrada.">Capex</th>
                    <th className="text-left px-2 py-2 font-medium text-muted-foreground text-xs">U.M.</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground text-xs">Qtd. Pedida</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground text-xs">Qtd. Recebida</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground text-xs">Vlr. Unit.</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground text-xs">% Desc.</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground text-xs">Vlr. Total</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground text-xs">Vlr. IPI</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground text-xs">Vlr. ICMS</th>
                    <th className="text-center px-2 py-2 font-medium text-muted-foreground text-xs">Status</th>
                    {itemsEditable && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(() => {
                    // Exibição: cada PAI seguido dos seus COMPONENTES (filhos);
                    // órfãos (pai removido) ao final. Par edit por id (não índice).
                    const pais = conferencia.itens.filter((i) => !i.paiId);
                    const ordenados = pais.flatMap((p) => [p, ...conferencia.itens.filter((f) => f.paiId === p.id)]);
                    const vistos = new Set(ordenados.map((i) => i.id));
                    return [...ordenados, ...conferencia.itens.filter((i) => !vistos.has(i.id))];
                  })().map((item, idx) => {
                    const ei = editItems.find((e) => e.id === item.id);
                    const ehFilho = !!item.paiId;
                    const qtdPedida = decimalToNumber(item.quantidadePedida);
                    const qtdRecebida = parseFloat(ei?.quantidadeRecebida ?? "0") || 0;
                    const itemStatus = getItemStatus(qtdPedida, qtdRecebida);
                    const localNome = item.localEstoque?.nome ?? null;

                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          "hover:bg-muted",
                          item.divergencia && !itemsEditable && !ehFilho && "bg-warning/10",
                          ehFilho && "bg-muted/40",
                        )}
                      >
                        <td className="px-2 py-1.5 text-xs text-muted-foreground">{ehFilho ? "" : idx + 1}</td>
                        <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{ehFilho && <span className="mr-1 text-muted-foreground/60">↳</span>}{item.item.codigo}</td>
                        <td className="px-2 py-1.5 text-xs text-foreground max-w-[200px]">
                          <span className={cn(ehFilho && "pl-2 text-muted-foreground")}>{item.item.descricao}</span>
                          {ehFilho && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground" title="Componente: decompõe o preço do item pai — não movimenta estoque nem financeiro">
                              componente
                            </span>
                          )}
                        </td>

                        {/* TES — preset de comportamento (preenche as flags); não decide destino */}
                        {modoTes === "POR_ITEM" && (
                          <td className="px-2 py-1.5">
                            {ehFilho ? (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            ) : canEdit && ei ? (
                              <ComboboxWithCreate
                                value={ei.tesId}
                                onChange={(v) => applyTesEdit(item.id, v)}
                                noneLabel="— TES —"
                                menuMinWidth={420}
                                triggerClassName={cn("h-7 rounded text-xs min-w-[11rem]", !ei.tesId && "border-red-400 bg-danger/10 text-danger")}
                                options={tesList.map((t) => ({ value: t.id, label: `${t.codigo} ${t.nome}` }))}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">{tesList.find((t) => t.id === item.tesId)?.codigo ?? "—"}</span>
                            )}
                          </td>
                        )}

                        {/* Local Estoque — only shown in Por Item mode */}
                        {modoLocalEstoque === "POR_ITEM" && (
                          <td className="px-2 py-1.5">
                            {ehFilho ? (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            ) : canEdit && ei ? (
                              <ComboboxWithCreate
                                value={ei.localEstoqueId}
                                onChange={(v) => updateEditItem(item.id, "localEstoqueId", v)}
                                noneLabel="—"
                                menuMinWidth={360}
                                triggerClassName={cn("h-7 rounded text-xs min-w-[11rem]", !ei.localEstoqueId && "border-red-400 bg-danger/10 text-danger")}
                                options={locaisEstoque.map((l) => ({ value: l.id, label: l.nome }))}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">{localNome ?? "—"}</span>
                            )}
                          </td>
                        )}

                        {/* Centro de custo — herdado do pedido, editável; não classifica destino */}
                        {modoCentro === "POR_ITEM" && (
                          <td className="px-2 py-1.5">
                            {ehFilho ? (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            ) : canEdit && ei ? (
                              <ComboboxWithCreate
                                value={ei.centroCustoId}
                                onChange={(v) => updateEditItem(item.id, "centroCustoId", v)}
                                noneLabel="—"
                                menuMinWidth={420}
                                triggerClassName={cn("h-7 rounded text-xs min-w-[12rem]", !ei.centroCustoId && "border-red-400 bg-danger/10 text-danger")}
                                options={[...centrosCusto].sort((a, b) => (a.grupoCentroCusto?.nome ?? "ZZZ").localeCompare(b.grupoCentroCusto?.nome ?? "ZZZ") || a.codigo.localeCompare(b.codigo, undefined, { numeric: true })).map((cc) => ({ value: cc.id, label: `${cc.codigo} - ${cc.nome}`, group: cc.grupoCentroCusto?.nome ?? "Sem grupo" }))}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">{item.centroCusto ? `${item.centroCusto.codigo} - ${item.centroCusto.nome}` : "—"}</span>
                            )}
                          </td>
                        )}

                        {/* Natureza da linha — classificação gerencial (rateio do CP) */}
                        {modoNatureza === "POR_ITEM" && (
                          <td className="px-2 py-1.5">
                            {ehFilho ? (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            ) : canEdit && ei ? (
                              <ComboboxWithCreate
                                value={ei.naturezaFinanceiraId}
                                onChange={(v) => updateEditItem(item.id, "naturezaFinanceiraId", v)}
                                noneLabel="—"
                                menuMinWidth={420}
                                triggerClassName="h-7 rounded text-xs min-w-[12rem]"
                                options={naturezaOptions}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">{naturezas.find((n) => n.id === (ei?.naturezaFinanceiraId ?? ""))?.nome ?? "—"}</span>
                            )}
                          </td>
                        )}

                        {/* Capex — capitaliza (carga/orçamento na entrada); exige o bem */}
                        <td className="px-2 py-1.5 text-center">
                          {ehFilho ? (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          ) : canEdit && ei ? (
                            <div className="flex flex-col items-center gap-1">
                              {(() => {
                                const t = tesList.find((x) => x.id === ei.tesId);
                                const bloq = !!t && !t.permiteCapitalizar;
                                return (
                                  <input type="checkbox" checked={ei.capitaliza} disabled={bloq}
                                    onChange={(e) => updateEditItem(item.id, "capitaliza", e.target.checked)}
                                    title={bloq
                                      ? "O TES desta linha não permite capitalizar"
                                      : "Capitaliza (imobilizado): marca a linha como capex e exige o bem"}
                                    className={cn("w-3.5 h-3.5 rounded border-border", bloq ? "opacity-40 cursor-not-allowed" : "cursor-pointer")} />
                                );
                              })()}
                              {ei.capitaliza && (
                                <>
                                  <select value={ei.imobilizadoId} onChange={(e) => updateEditItem(item.id, "imobilizadoId", e.target.value)}
                                    className={cn("h-7 rounded text-xs w-full border bg-card px-1.5 min-w-[11rem]",!ei.imobilizadoId ? "border-red-400 bg-danger/10" : "border-border")}>
                                    <option value="">— Bem (obrigatório) —</option>
                                    {imobilizados.map((b) => <option key={b.id} value={b.id}>{b.descricao}</option>)}
                                  </select>
                                  <select value={ei.componenteSubstituidoId} onChange={(e) => updateEditItem(item.id, "componenteSubstituidoId", e.target.value)}
                                    className="h-7 rounded text-xs w-full border border-border bg-card px-1" title="Componente velho a dar baixa (troca)">
                                    <option value="">— Troca? componente —</option>
                                    {imobilizados.map((b) => <option key={b.id} value={b.id}>{b.descricao}</option>)}
                                  </select>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{item.capitaliza ? (item.imobilizado?.descricao ?? "Capex") : "—"}</span>
                          )}
                        </td>

                        <td className="px-2 py-1.5 text-xs text-muted-foreground">{item.item.unidadeMedida}</td>

                        {/* Qtd. Pedida */}
                        <td className="px-2 py-1.5 text-right text-xs text-foreground">
                          {qtdPedida.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                        </td>

                        {/* Qtd. Recebida (+ unidade de compra, se houver) */}
                        <td className="px-2 py-1.5">
                          {itemsEditable && ei ? (
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  className="w-24 text-right h-7 text-xs"
                                  value={ei.quantidadeRecebida}
                                  onChange={(e) => updateItemAndCalc(item.id, "quantidadeRecebida", e.target.value)}
                                />
                                {ei.unidades.length > 1 && (
                                  <select
                                    value={ei.unidadeId}
                                    onChange={(e) => setEditItems((prev) => prev.map((x) => x.id === item.id ? { ...x, unidadeId: e.target.value } : x))}
                                    className="h-7 rounded border border-border bg-card px-1 text-xs"
                                    title="Unidade da compra"
                                  >
                                    {ei.unidades.map((u) => (
                                      <option key={u.unidadeId || "base"} value={u.unidadeId}>{u.sigla}{u.base ? "" : ` (×${u.fator})`}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                              {(() => {
                                const u = ei.unidades.find((x) => x.unidadeId === ei.unidadeId);
                                const fator = u && !u.base ? u.fator : 1;
                                if (fator === 1) return null;
                                const base = (parseFloat(ei.quantidadeRecebida) || 0) * fator;
                                return <span className="text-[10px] text-muted-foreground">= {base.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {ei.baseSigla}</span>;
                              })()}
                            </div>
                          ) : (
                            <span className="block text-right text-xs text-foreground">
                              {decimalToNumber(item.quantidadeRecebida).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                            </span>
                          )}
                        </td>

                        {/* Vlr. Unit (por unidade de compra; mostra o custo na base) */}
                        <td className="px-2 py-1.5">
                          {itemsEditable && ei ? (
                            <div className="flex flex-col items-end gap-1">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                className="w-24 text-right h-7 text-xs"
                                value={ei.vlrUnitario}
                                onChange={(e) => updateItemAndCalc(item.id, "vlrUnitario", e.target.value)}
                              />
                              {(() => {
                                const u = ei.unidades.find((x) => x.unidadeId === ei.unidadeId);
                                const fator = u && !u.base ? u.fator : 1;
                                if (fator === 1) return null;
                                const custoBase = (parseFloat(ei.vlrUnitario) || 0) / fator;
                                return <span className="text-[10px] text-muted-foreground">{formatBRL(custoBase)}/{ei.baseSigla}</span>;
                              })()}
                            </div>
                          ) : (
                            <span className="block text-right text-xs text-foreground">
                              {decimalToNumber(item.vlrUnitario) > 0
                                ? formatBRL(decimalToNumber(item.vlrUnitario))
                                : "—"}
                            </span>
                          )}
                        </td>

                        {/* % Desc. */}
                        <td className="px-2 py-1.5">
                          {itemsEditable && ei ? (
                            <div className="relative w-20 ml-auto">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                className="w-20 text-right h-7 text-xs pr-5"
                                value={ei.desconto}
                                onChange={(e) => updateItemAndCalc(item.id, "desconto", e.target.value)}
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                            </div>
                          ) : (
                            <span className="block text-right text-xs text-foreground">
                              {decimalToNumber(item.desconto) > 0
                                ? `${decimalToNumber(item.desconto)}%`
                                : "—"}
                            </span>
                          )}
                        </td>

                        {/* Vlr. Total */}
                        <td className="px-2 py-1.5">
                          {itemsEditable && ei ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-24 ml-auto text-right h-7 text-xs"
                              value={ei.vlrTotal}
                              onChange={(e) => updateEditItem(item.id, "vlrTotal", e.target.value)}
                            />
                          ) : (
                            <span className="block text-right text-xs text-foreground">
                              {decimalToNumber(item.vlrTotal) > 0
                                ? formatBRL(decimalToNumber(item.vlrTotal))
                                : "—"}
                            </span>
                          )}
                        </td>

                        {/* Vlr. IPI */}
                        <td className="px-2 py-1.5">
                          {itemsEditable && ei ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-24 ml-auto text-right h-7 text-xs"
                              value={ei.vlrIPI}
                              onChange={(e) => updateEditItem(item.id, "vlrIPI", e.target.value)}
                            />
                          ) : (
                            <span className="block text-right text-xs text-foreground">
                              {decimalToNumber(item.vlrIPI) > 0
                                ? formatBRL(decimalToNumber(item.vlrIPI))
                                : "—"}
                            </span>
                          )}
                        </td>

                        {/* Vlr. ICMS */}
                        <td className="px-2 py-1.5">
                          {itemsEditable && ei ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-24 ml-auto text-right h-7 text-xs"
                              value={ei.vlrICMS}
                              onChange={(e) => updateEditItem(item.id, "vlrICMS", e.target.value)}
                            />
                          ) : (
                            <span className="block text-right text-xs text-foreground">
                              {decimalToNumber(item.vlrICMS) > 0
                                ? formatBRL(decimalToNumber(item.vlrICMS))
                                : "—"}
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-2 py-1.5 text-center">
                          {ehFilho ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">Comp.</span>
                          ) : (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${itemStatus.cls}`}
                            >
                              {itemsEditable ? itemStatus.label : (item.divergencia ? "Divergência" : "OK")}
                            </span>
                          )}
                        </td>
                        {itemsEditable && (
                          <td className="w-8 text-center">
                            {!ehFilho && (
                              <button
                                type="button"
                                onClick={() => { setComponenteDe({ paiId: item.id, descricao: item.item.descricao }); setShowAddRow(true); }}
                                className="text-info hover:text-info/80 text-xs font-medium"
                                title="Adicionar componente (decompõe o preço deste item — não movimenta estoque)"
                              >⊕</button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {/* ── Novas linhas adicionadas ─────────────────────────── */}
                  {newItems.map((ni) => (
                    <tr key={ni._key} className={cn("bg-info/10 hover:bg-info/10", (ni.paiId || ni.paiKey) && "bg-muted/40")}>
                      <td className="px-2 py-1.5 text-xs text-blue-400">{ni.paiId || ni.paiKey ? "↳" : "+"}</td>
                      <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{ni.codigo}</td>
                      <td className="px-2 py-1.5 text-xs text-foreground max-w-[200px]">
                        {ni.descricao}
                        {(ni.paiId || ni.paiKey) && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground" title="Componente: decompõe o preço do item pai — não movimenta estoque nem financeiro">
                            componente
                          </span>
                        )}
                      </td>
                      {/* TES */}
                      {modoTes === "POR_ITEM" && (
                        <td className="px-2 py-1.5">
                          {ni.paiId || ni.paiKey ? (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          ) : (
                          <ComboboxWithCreate
                            value={ni.tesId}
                            onChange={(v) => applyTesNew(ni._key, v)}
                            noneLabel="— TES —"
                            menuMinWidth={420}
                            triggerClassName={cn("h-7 rounded text-xs min-w-[11rem]", !ni.tesId && "border-red-400 bg-danger/10 text-danger")}
                            options={tesList.map((t) => ({ value: t.id, label: `${t.codigo} ${t.nome}` }))}
                          />
                          )}
                        </td>
                      )}
                      {modoLocalEstoque === "POR_ITEM" && (
                        <td className="px-2 py-1.5">
                          {ni.paiId || ni.paiKey ? (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          ) : (
                          <ComboboxWithCreate
                            value={ni.localEstoqueId}
                            onChange={(v) => updateNewItem(ni._key, "localEstoqueId", v)}
                            noneLabel="—"
                            menuMinWidth={360}
                            triggerClassName={cn("h-7 rounded text-xs min-w-[11rem]", !ni.localEstoqueId && "border-red-400 bg-danger/10 text-danger")}
                            options={locaisEstoque.map((l) => ({ value: l.id, label: l.nome }))}
                          />
                          )}
                        </td>
                      )}
                      {/* Centro de custo */}
                      {modoCentro === "POR_ITEM" && (
                        <td className="px-2 py-1.5">
                          {ni.paiId || ni.paiKey ? (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          ) : (
                          <ComboboxWithCreate
                            value={ni.centroCustoId}
                            onChange={(v) => updateNewItem(ni._key, "centroCustoId", v)}
                            noneLabel="—"
                            menuMinWidth={420}
                            triggerClassName={cn("h-7 rounded text-xs min-w-[12rem]", !ni.centroCustoId && "border-red-400 bg-danger/10 text-danger")}
                            options={[...centrosCusto].sort((a, b) => (a.grupoCentroCusto?.nome ?? "ZZZ").localeCompare(b.grupoCentroCusto?.nome ?? "ZZZ") || a.codigo.localeCompare(b.codigo, undefined, { numeric: true })).map((cc) => ({ value: cc.id, label: `${cc.codigo} - ${cc.nome}`, group: cc.grupoCentroCusto?.nome ?? "Sem grupo" }))}
                          />
                          )}
                        </td>
                      )}
                      {/* Natureza da linha */}
                      {modoNatureza === "POR_ITEM" && (
                        <td className="px-2 py-1.5">
                          {ni.paiId || ni.paiKey ? (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          ) : (
                          <ComboboxWithCreate
                            value={ni.naturezaFinanceiraId}
                            onChange={(v) => updateNewItem(ni._key, "naturezaFinanceiraId", v)}
                            noneLabel="—"
                            menuMinWidth={420}
                            triggerClassName="h-7 rounded text-xs min-w-[12rem]"
                            options={naturezaOptions}
                          />
                          )}
                        </td>
                      )}
                      {/* Capex */}
                      <td className="px-2 py-1.5 text-center">
                        {ni.paiId || ni.paiKey ? (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        ) : (
                        <div className="flex flex-col items-center gap-1">
                          {(() => {
                            const t = tesList.find((x) => x.id === ni.tesId);
                            const bloq = !!t && !t.permiteCapitalizar;
                            return (
                              <input type="checkbox" checked={ni.capitaliza} disabled={bloq}
                                onChange={(e) => updateNewItem(ni._key, "capitaliza", e.target.checked)}
                                title={bloq
                                  ? "O TES desta linha não permite capitalizar"
                                  : "Capitaliza (imobilizado): marca a linha como capex e exige o bem"}
                                className={cn("w-3.5 h-3.5 rounded border-border", bloq ? "opacity-40 cursor-not-allowed" : "cursor-pointer")} />
                            );
                          })()}
                          {ni.capitaliza && (
                            <>
                              <select value={ni.imobilizadoId} onChange={(e) => updateNewItem(ni._key, "imobilizadoId", e.target.value)}
                                className={cn("h-7 rounded text-xs w-full border bg-card px-1.5 min-w-[11rem]",!ni.imobilizadoId ? "border-red-400 bg-danger/10" : "border-border")}>
                                <option value="">— Bem (obrigatório) —</option>
                                {imobilizados.map((b) => <option key={b.id} value={b.id}>{b.descricao}</option>)}
                              </select>
                              <select value={ni.componenteSubstituidoId} onChange={(e) => updateNewItem(ni._key, "componenteSubstituidoId", e.target.value)}
                                className="h-7 rounded text-xs w-full border border-border bg-card px-1" title="Componente velho a dar baixa (troca)">
                                <option value="">— Troca? componente —</option>
                                {imobilizados.map((b) => <option key={b.id} value={b.id}>{b.descricao}</option>)}
                              </select>
                            </>
                          )}
                        </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">{ni.unidadeMedida}</td>
                      <td className="px-2 py-1.5 text-right text-xs text-muted-foreground">—</td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number" step="0.001" min="0"
                          className="w-24 ml-auto text-right h-7 text-xs"
                          value={ni.quantidadeRecebida}
                          onChange={(e) => updateNewItem(ni._key, "quantidadeRecebida", e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number" step="0.01" min="0"
                          className="w-24 ml-auto text-right h-7 text-xs"
                          value={ni.vlrUnitario}
                          onChange={(e) => updateNewItem(ni._key, "vlrUnitario", e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="relative w-20 ml-auto">
                          <Input
                            type="number" step="0.01" min="0" max="100"
                            className="w-20 text-right h-7 text-xs pr-5"
                            value={ni.desconto}
                            onChange={(e) => updateNewItem(ni._key, "desconto", e.target.value)}
                          />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number" step="0.01" min="0"
                          className="w-24 ml-auto text-right h-7 text-xs"
                          value={ni.vlrTotal}
                          onChange={(e) => updateNewItem(ni._key, "vlrTotal", e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number" step="0.01" min="0"
                          className="w-24 ml-auto text-right h-7 text-xs"
                          value={ni.vlrIPI}
                          onChange={(e) => updateNewItem(ni._key, "vlrIPI", e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number" step="0.01" min="0"
                          className="w-24 ml-auto text-right h-7 text-xs"
                          value={ni.vlrICMS}
                          onChange={(e) => updateNewItem(ni._key, "vlrICMS", e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeNewItem(ni._key)}
                          className="text-red-400 hover:text-danger text-xs font-medium"
                          title="Remover"
                        >✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ── Abas (rodapé estilo Protheus): Duplicatas | Totais | Outros ── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-1 border-b border-border bg-muted px-2 flex-wrap">
            {([
              { id: "duplicatas", label: "Duplicatas" },
              { id: "pagamento", label: "Pagamento" },
              { id: "totais", label: "Totais" },
              { id: "outros", label: "Outros" },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setAba(t.id)}
                className={cn(
                  "relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors -mb-px border-b-2",
                  aba === t.id
                    ? "border-info text-info"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
            <div className="ml-auto pr-3 py-2.5 text-sm text-muted-foreground whitespace-nowrap">
              Vlr. Líquido: <b className="text-foreground">{vlrLiquido > 0 ? formatBRL(vlrLiquido) : "—"}</b>
            </div>
          </div>

          <div className="p-3">
            {/* ── Aba Duplicatas ──────────────────────────────────────────── */}
            {aba === "duplicatas" && (
              <DuplicatasTab
                titulosReais={titulosReais}
                preview={duplicatasPreview}
                condicaoNome={condicaoNomeAtual}
                fornecedorNome={fornNome}
                concluida={isConcluded || isDivergencia}
                parcelasCustom={nfEditable ? parcelasCustom : null}
                onParcelasCustomChange={nfEditable ? setParcelasCustom : undefined}
                onGradeReaisSalva={load}
                headerControls={
                  <>
                    <div className="space-y-1">
                      <span className="flex items-center gap-1.5">
                        <Label className="text-xs text-muted-foreground">Condição de Pagamento</Label>
                        <InfoHint>A condição estrutura o <b>prazo</b> do negócio (à vista, parcelado, sem vencimento).</InfoHint>
                      </span>
                      {nfEditable ? (
                        <ComboboxWithCreate
                          value={condicaoPagamentoId}
                          onChange={(v) => setCondicaoPagamentoId(v)}
                          noneLabel="— Herdar do pedido / à vista —"
                          triggerClassName="h-9 rounded-md"
                          options={condicoes.map((c) => ({ value: c.id, label: c.nome }))}
                        />
                      ) : (
                        <Input value={condicoes.find((c) => c.id === condicaoPagamentoId)?.nome ?? "—"} readOnly className="bg-muted" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <span className="flex items-center gap-1.5">
                        <Label className="text-xs text-muted-foreground">Forma de Pagamento (prevista)</Label>
                        <InfoHint>A forma é o <b>meio de quitação</b> (PIX, dinheiro, permuta…) — <b>permuta</b> substitui dinheiro por bens/serviços, total ou parcialmente.</InfoHint>
                      </span>
                      {nfEditable ? (
                        <ComboboxWithCreate
                          value={formaPagamentoId}
                          onChange={setFormaPagamentoId}
                          noneLabel="— Definir na baixa —"
                          triggerClassName="h-9 rounded-md"
                          options={formasPagamento.filter((f) => f.ativo !== false).map((f) => ({ value: f.id, label: f.nome }))}
                        />
                      ) : (
                        <Input value={formasPagamento.find((f) => f.id === formaPagamentoId)?.nome ?? "—"} readOnly className="bg-muted" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <span className="flex items-center gap-1.5">
                        <Label className="text-xs text-muted-foreground">Natureza Financeira (prevista)</Label>
                        <InfoHint>
                          Em compras de <b>estoque</b>, a natureza é só classificação gerencial (default do título; pode ser rateada na baixa) — a contabilização da entrada vem do <b>estoque/local</b>, não da natureza.
                        </InfoHint>
                      </span>
                      {modoNatureza === "POR_ITEM" ? (
                        <Input value="Definida por item (coluna Natureza nos itens)" readOnly className="bg-muted h-9 text-xs" />
                      ) : nfEditable ? (
                        <NaturezaCombobox
                          value={naturezaFinanceiraId}
                          onChange={applyNaturezaGlobal}
                          naturezas={naturezas}
                          placeholder="— Selecionar natureza —"
                        />
                      ) : (
                        <Input value={naturezas.find((n) => n.id === naturezaFinanceiraId)?.nome ?? "—"} readOnly className="bg-muted" />
                      )}
                    </div>
                  </>
                }
              />
            )}

            {/* ── Aba Pagamento (já realizado — entrada/sinal da fatura) ──── */}
            {aba === "pagamento" && (
              <div className="max-w-2xl space-y-3">
                <span className="flex items-center gap-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pagamento já realizado</Label>
                  <InfoHint>Na conclusão vira um título <b>quitado</b> (baixado nessa data, saindo da conta) e as parcelas da condição incidem só sobre o <b>restante</b> — a aba Duplicatas reflete na hora.</InfoHint>
                </span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Valor pago</Label>
                    {nfEditable ? (
                      <Input type="number" step="0.01" min="0" value={valorPagoAntecipado}
                        onChange={(e) => setValorPagoAntecipado(e.target.value)}
                        placeholder="0,00" className="h-9 text-right" />
                    ) : (
                      <Input value={parseFloat(valorPagoAntecipado) > 0 ? formatBRL(parseFloat(valorPagoAntecipado)) : "—"} readOnly className="bg-muted h-9 text-right" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Data do pagamento</Label>
                    <DatePicker value={dataPagoAntecipado} onChange={setDataPagoAntecipado} disabled={!nfEditable} triggerClassName="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Forma</Label>
                    <ComboboxWithCreate
                      value={formaPagoAntecipadoId}
                      onChange={setFormaPagoAntecipadoId}
                      noneLabel="—"
                      disabled={!nfEditable}
                      triggerClassName="h-9 rounded-md"
                      options={formasPagamento.filter((f) => f.ativo !== false && f.tipo !== "PERMUTA").map((f) => ({ value: f.id, label: f.nome }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Conta de saída</Label>
                    <ComboboxWithCreate
                      value={contaPagoAntecipadoId}
                      onChange={setContaPagoAntecipadoId}
                      noneLabel="—"
                      disabled={!nfEditable}
                      triggerClassName={cn("h-9 rounded-md", parseFloat(valorPagoAntecipado) > 0 && !contaPagoAntecipadoId && "border-red-400 bg-danger/10")}
                      options={contasBancarias.map((c) => ({ value: c.id, label: c.nome }))}
                    />
                  </div>
                </div>
                {/* Resumo — mesma conta da prévia das Duplicatas; concluída, os
                    títulos reais (inclusive o quitado da entrada) estão na aba Duplicatas. */}
                {!isConcluded && !isDivergencia ? (
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs grid grid-cols-3 gap-2">
                    <div><span className="block text-[10px] uppercase tracking-wide text-muted-foreground/70">A pagar</span><span className="text-foreground font-medium">{formatBRL(duplicatasPreview.valor)}</span></div>
                    <div><span className="block text-[10px] uppercase tracking-wide text-muted-foreground/70">Já pago</span><span className="text-success font-medium">{formatBRL(duplicatasPreview.entradaPaga?.valor ?? 0)}</span></div>
                    <div><span className="block text-[10px] uppercase tracking-wide text-muted-foreground/70">Restante a parcelar</span><span className="text-foreground font-medium">{formatBRL(duplicatasPreview.restante)}</span></div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Documento concluído — os títulos gerados (inclusive o quitado da entrada) estão na aba <b>Duplicatas</b>.</p>
                )}
              </div>
            )}

            {/* ── Aba Totais ──────────────────────────────────────────────── */}
            {aba === "totais" && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Vlr. Mercadoria</Label>
                  {itemsEditable ? (
                    <Input value={formatBRL(vlrMercadoria)} readOnly className="bg-muted text-right" />
                  ) : (
                    <Input value={vlrMercadoria > 0 ? formatBRL(vlrMercadoria) : "—"} readOnly className="bg-muted text-right" />
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Frete</Label>
              {nfEditable ? (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={frete}
                  onChange={(e) => setFrete(e.target.value)}
                  placeholder="0,00"
                  className="text-right"
                />
              ) : (
                <Input value={freteNum > 0 ? formatBRL(freteNum) : "—"} readOnly className="bg-muted text-right" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Seguro</Label>
              {nfEditable ? (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={seguro}
                  onChange={(e) => setSeguro(e.target.value)}
                  placeholder="0,00"
                  className="text-right"
                />
              ) : (
                <Input value={seguroNum > 0 ? formatBRL(seguroNum) : "—"} readOnly className="bg-muted text-right" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Despesas</Label>
              {nfEditable ? (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={despesas}
                  onChange={(e) => setDespesas(e.target.value)}
                  placeholder="0,00"
                  className="text-right"
                />
              ) : (
                <Input value={despesasNum > 0 ? formatBRL(despesasNum) : "—"} readOnly className="bg-muted text-right" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Desc. Total Itens</Label>
              <Input
                value={descontoTotalItens > 0 ? formatBRL(descontoTotalItens) : "—"}
                readOnly
                className="bg-muted text-right text-danger"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Desc. Global (NF)</Label>
              {nfEditable ? (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={desconto}
                  onChange={(e) => setDesconto(e.target.value)}
                  placeholder="0,00"
                  className="text-right"
                />
              ) : (
                <Input value={descontoNum > 0 ? formatBRL(descontoNum) : "—"} readOnly className="bg-muted text-right" />
              )}
            </div>
            {descontoHerdado > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Desc. do Pedido (rateado)</Label>
                <Input
                  value={`− ${formatBRL(descontoHerdado)}`}
                  readOnly
                  className="bg-muted text-right text-danger"
                />
              </div>
            )}
            {freteHerdado > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Frete/Encargos do Pedido (rateado)</Label>
                <Input
                  value={`+ ${formatBRL(freteHerdado)}`}
                  readOnly
                  className="bg-muted text-right"
                />
              </div>
            )}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Vlr. Líquido</Label>
                  <Input
                    value={vlrLiquido > 0 ? formatBRL(vlrLiquido) : "—"}
                    readOnly
                    className="bg-info/10 text-right font-bold text-blue-900 border-info/30"
                  />
                </div>
              </div>
            )}

            {/* ── Aba Outros ──────────────────────────────────────────────── */}
            {aba === "outros" && (
              <div className="space-y-4">
                {(isEditable || isDivergencia || (isConcluded && isAdmin)) && (
                  <div className="space-y-1.5 max-w-xs">
                    <Label>Responsável pela Conferência</Label>
                    <ComboboxWithCreate
                      value={usuarioResponsavelId}
                      onChange={(v) => {
                        const selected = usuarios.find((u) => u.id === v);
                        setUsuarioResponsavelId(v);
                        setResponsavel(selected?.nome ?? "");
                      }}
                      noneLabel="— Selecionar usuário —"
                      triggerClassName="h-9 rounded-md"
                      options={usuarios.map((u) => ({ value: u.id, label: u.nome }))}
                    />
                  </div>
                )}
                <Autoria criadoPor={conferencia.criadoPor} atualizadoPor={conferencia.atualizadoPor} />
              </div>
            )}
          </div>
        </div>


        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <div className="flex gap-3 flex-wrap">
          {isPendente && (
            <Button onClick={iniciarConferencia} disabled={actioning}>
              {actioning ? "Iniciando..." : "Iniciar Conferência"}
            </Button>
          )}

          {canEdit && !actioning && (
            <Button variant="outline" onClick={salvarConferencia} disabled={saving}>
              {saving ? "Salvando..." : "Salvar Progresso"}
            </Button>
          )}

          {(isEditable || isDivergencia) && (
            <Button
              onClick={() => {
                if (hasDivergencias) {
                  setShowDivergenciaConfirm(true);
                } else {
                  concluir();
                }
              }}
              disabled={actioning}
            >
              {actioning ? "Concluindo..." : "Concluir"}
            </Button>
          )}
        </div>
      </div>

      {/* ── Popup: novos vínculos fornecedor × produto ───────────────────────── */}
      {vinculoPopup && (
        <div className="fixed inset-0 z-[9200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setVinculoPopup(null)} />
          <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-start gap-3 px-6 pt-6 pb-4 border-b border-border">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/10">
                <LinkIcon className="w-5 h-5 text-info" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Novo vínculo fornecedor × produto</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ao concluir, {vinculoPopup.novos.length === 1 ? "o produto abaixo será vinculado" : `os ${vinculoPopup.novos.length} produtos abaixo serão vinculados`} ao fornecedor{" "}
                  <span className="font-medium text-foreground">{vinculoPopup.fornecedorNome}</span> pela primeira vez.
                </p>
              </div>
            </div>
            {/* Product list */}
            <ul className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
              {vinculoPopup.novos.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-6 py-2.5">
                  <span className="font-mono text-[11px] text-muted-foreground w-16 shrink-0">{item.codigo}</span>
                  <span className="text-sm text-foreground">{item.descricao}</span>
                </li>
              ))}
            </ul>
            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 bg-muted border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setVinculoPopup(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => doConcluir()}
              >
                Confirmar e concluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
