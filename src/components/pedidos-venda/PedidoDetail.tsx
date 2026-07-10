"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ModalPortal from "@/components/shared/ModalPortal";
import StatusDimBadges, { EntregaBadge, FinanceiroBadge } from "@/components/pedidos-venda/StatusDimBadges";
import StatusBadge from "@/components/shared/StatusBadge";
import { Autoria } from "@/components/shared/Autoria";
import DatePicker from "@/components/shared/DatePicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatBRL, formatDate, decimalToNumber, cn, parseDecimal } from "@/lib/utils";
import { useTabTitle, useTabsContext } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";
import { Plus, Truck, Pencil, Package, Trash2, AlertTriangle, RefreshCw, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import MinutaActionsMenu from "./MinutaActionsMenu";
import DevolucaoButton from "./DevolucaoButton";
import PagamentosInput, {
  novaLinhaPagamento, pagamentosPayload, pagamentosValidos, contaCaixaPadrao, parseValorBR,
  contaPadraoParaForma, pagamentoContaInvalida, pagamentoCartaoSemMaquineta,
  type LinhaPagamento, type FormaOpt,
} from "./PagamentosInput";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";

type MinutaItemSummary = { quantidade: string };

type ItemRow = {
  id: string;
  itemId: string;
  quantidade: unknown;
  precoUnitario: unknown;
  desconto: unknown;
  valorTotal: unknown;
  // Venda à ordem por item: origem da linha (quando sobrepõe a padrão do pedido).
  estoqueOrigemEmpresa?: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  item: {
    codigo: string;
    descricao: string;
    unidadeMedida: string;
    unidade: { id: string; sigla: string; nome: string } | null;
    itemUnidades: { id: string; fatorConversao: string | null; unidade: { id: string; sigla: string; nome: string } }[];
  };
  minutaItens: MinutaItemSummary[];
};

type MinutaDoPedido = {
  id: string;
  numero: string;
  numeroFisico: string | null;
  status: "PENDENTE" | "SAIU_PARA_ENTREGA" | "ENTREGUE" | "CANCELADA";
  dataEmissao: string;
  dataEntrega: string | null;
  motorista: { id: string; nome: string } | null;
  placa: string | null;
  localEstoque: { id: string; nome: string } | null;
  itens: { id: string; pedidoVendaItemId: string; quantidade: string; quantidadeConvertida: string | null; unidade: { id: string; sigla: string } | null }[];
};

type ItemComodato = { id: string; codigo: string; descricao: string; precoVenda: number };

type MovComodato = {
  id: string;
  itemId: string;
  tipo: "SAIDA" | "RETORNO";
  quantidade: number;
  valorUnitario: number;
  data: string;
  documento: string | null;
  observacoes: string | null;
  item: { id: string; codigo: string; descricao: string };
};

type ItemPendente = {
  codigo: string; descricao: string; unidade: string;
  pedida: number; entregue: number; pendente: number;
};

type PedidoDetailProps = {
  pedido: {
    id: string; numero: string; numeroOrcamento: string | null; status: string; intragrupo?: boolean; modalidade?: string;
    necessidadePagamento?: string | null; necessidadeEntrega?: string | null;
    statusEntrega?: string | null; statusFinanceiro?: string | null;
    dataEmissao: Date | string; dataEntrega: Date | string | null; dataConclusao: Date | string | null;
    estoqueOrigemEmpresa?: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
    precoTransferencia?: unknown;
    pedidoVendaOrigem?: { id: string; numero: string; empresa: { razaoSocial: string; nomeFantasia: string | null } | null } | null;
    entregasTriangular?: { id: string; numero: string; status: string; empresa: { razaoSocial: string; nomeFantasia: string | null } | null }[];
    condicaoPagamento: string | null; formaPagamento: string | null; observacoes: string | null;
    criadoPor?: string | null; atualizadoPor?: string | null;
    valorProdutos: unknown; valorDesconto: unknown; valorFrete: unknown; valorTotal: unknown;
    cliente: { id: string; razaoSocial: string };
    clienteFinal?: { id: string; razaoSocial: string } | null;
    vendedor?: { id: string; nome: string } | null;
    pagamentos?: { id: string; forma: string; valor: unknown; contaBancaria?: { id: string; nome: string } | null }[];
    itens: ItemRow[];
    contasReceber: {
      id: string; numero: string; status: string;
      valorOriginal: unknown; valorPago: unknown;
      dataVencimento: Date | string | null; dataPagamento: Date | string | null;
      parcelaNumero?: number | null; parcelaTotal?: number | null;
    }[];
    minutas?: MinutaDoPedido[];
  };
  itensComodato: ItemComodato[];
  movimentacoesComodato: MovComodato[];
};

const NEXT_STATUS: Record<string, { label: string; next: string; variant?: "default" | "destructive" | "outline" }[]> = {
  ORCAMENTO:   [{ label: "Confirmar Pedido", next: "CONFIRMADO" }, { label: "Cancelar", next: "CANCELADO", variant: "destructive" }],
  CONFIRMADO:     [{ label: "Agendar Entrega", next: "EM_AGENDAMENTO" }, { label: "Cancelar", next: "CANCELADO", variant: "destructive" }],
  EM_AGENDAMENTO: [{ label: "Concluir Pedido", next: "CONCLUIDO" }, { label: "Cancelar", next: "CANCELADO", variant: "destructive" }],
  CONCLUIDO:   [],
  CANCELADO:   [],
};

// Todos os status do pedido (usado no override de admin).
const STATUS_PEDIDO: { value: string; label: string }[] = [
  { value: "ORCAMENTO", label: "Orçamento" },
  { value: "CONFIRMADO", label: "Confirmado" },
  { value: "EM_AGENDAMENTO", label: "Em agendamento" },
  { value: "CONCLUIDO", label: "Concluído" },
  { value: "CANCELADO", label: "Cancelado" },
];

const STATUS_LABEL: Record<string, string> = {
  PENDENTE:          "Pendente",
  SAIU_PARA_ENTREGA: "Saiu p/ Entrega",
  ENTREGUE:          "Entregue",
  CANCELADA:         "Cancelada",
};

const STATUS_COLOR: Record<string, string> = {
  PENDENTE:          "bg-warning/15 text-warning border border-warning/30",
  SAIU_PARA_ENTREGA: "bg-info/15 text-info border border-info/30",
  ENTREGUE:          "bg-success/15 text-success border border-success/30",
  CANCELADA:         "bg-muted text-muted-foreground border border-border",
};

function fmtQty(v: unknown) {
  const n = typeof v === "string" ? parseFloat(v) : decimalToNumber(v);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  // Format in UTC to match the entered day (date-only values are UTC midnight).
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function fmtNum(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Converte uma data (Date|string) para o formato YYYY-MM-DD do <input type=date>,
// usando o fuso de São Paulo para não desviar o dia.
function dateInput(value: Date | string | null | undefined) {
  if (!value) return todayInput();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return todayInput();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  return parts; // en-CA já entrega "YYYY-MM-DD"
}

export default function PedidoDetail({ pedido, itensComodato, movimentacoesComodato }: PedidoDetailProps) {
  const router = useRouter();
  const { replaceCurrentTab } = useTabsContext();
  useTabTitle(pedido.numero);
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";
  const [loading, setLoading] = useState(false);
  const [mainTab, setMainTab] = useState<"informacoes" | "minutas" | "pagamento">("informacoes");
  const [activeTab, setActiveTab] = useState<"itens" | "comodato">("itens");
  const [blockModal, setBlockModal] = useState<{ msg: string; pendentes: ItemPendente[] } | null>(null);
  // Exclusão de pedido (apenas ADMIN).
  const [excluirOpen, setExcluirOpen] = useState(false);
  const [excluirErro, setExcluirErro] = useState("");

  async function excluirPedido() {
    setLoading(true);
    setExcluirErro("");
    try {
      const res = await fetch(`/api/pedidos-venda/${pedido.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setExcluirErro(j.error ?? "Não foi possível excluir o pedido."); return; }
      router.push("/pedidos-venda");
    } finally { setLoading(false); }
  }
  // Modal de conclusão: informa a data (default hoje; editável p/ lançamento passado).
  const [concluirOpen, setConcluirOpen] = useState(false);
  const [concluirData, setConcluirData] = useState(todayInput());
  // Conclusão com saldo a entregar: pergunta se os materiais já foram retirados.
  const [concluirRetirado, setConcluirRetirado] = useState<"sim" | "nao" | null>(null);
  const [concluirLocalId, setConcluirLocalId] = useState("");
  const [concluirErro, setConcluirErro] = useState("");

  // Venda balcão (retirada na loja): recebe o pagamento e conclui em uma ação.
  const balcaoTotal = decimalToNumber(pedido.valorTotal);
  const [balcaoOpen, setBalcaoOpen] = useState(false);
  const [balcaoLocalId, setBalcaoLocalId] = useState("");
  const [balcaoData, setBalcaoData] = useState(dateInput(pedido.dataEmissao));
  const [balcaoErro, setBalcaoErro] = useState("");
  const [balcaoLocais, setBalcaoLocais] = useState<{ id: string; nome: string }[]>([]);
  const [balcaoFormas, setBalcaoFormas] = useState<FormaOpt[]>([]);
  const [balcaoContas, setBalcaoContas] = useState<{ id: string; nome: string; tipo?: string; ativo?: boolean }[]>([]);
  const [balcaoPagamentos, setBalcaoPagamentos] = useState<LinhaPagamento[]>([novaLinhaPagamento()]);

  function abrirBalcao() {
    setBalcaoErro("");
    // Recebimento balcão puxa a data de emissão (cliente pagou na hora);
    // editável para cobrir pedidos antigos lançados depois.
    setBalcaoData(dateInput(pedido.dataEmissao));
    setBalcaoPagamentos([novaLinhaPagamento(
      pedido.formaPagamento ?? "",
      contaPadraoParaForma(pedido.formaPagamento ?? "", balcaoFormas, balcaoContas),
      balcaoTotal > 0 ? balcaoTotal.toFixed(2).replace(".", ",") : "",
    )]);
    setBalcaoOpen(true);
    fetch("/api/suprimentos/locais-estoque")
      .then((r) => r.json())
      .then((j) => {
        const locais = Array.isArray(j) ? j : (j.data ?? []);
        setBalcaoLocais(locais);
        if (locais.length === 1) setBalcaoLocalId(locais[0].id);
      })
      .catch(() => {});
    fetch("/api/suprimentos/formas-pagamento")
      .then((r) => r.json())
      .then((j) => setBalcaoFormas(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
    fetch("/api/financeiro/contas")
      .then((r) => r.json())
      .then((j) => setBalcaoContas(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
  }

  async function concluirBalcao() {
    if (!balcaoLocalId) { setBalcaoErro("Informe o local de estoque da retirada."); return; }
    if (!balcaoData) { setBalcaoErro("Confirme a data do recebimento."); return; }
    // Cartão (crédito/débito) exige a maquineta — a conta da administradora e
    // a taxa derivam dela (venda no cartão = troca de credor).
    const cartaoSemMaq = pagamentoCartaoSemMaquineta(balcaoPagamentos, balcaoFormas);
    if (cartaoSemMaq) {
      setBalcaoErro(`Selecione a maquineta para "${cartaoSemMaq.forma}" — sem maquineta cadastrada, cadastre em Financeiro → Cartões.`);
      return;
    }
    if (!pagamentosValidos(balcaoPagamentos, balcaoFormas, balcaoTotal, true)) {
      setBalcaoErro("Confira as formas de pagamento — a soma precisa cobrir o total (troco só em dinheiro).");
      return;
    }
    const balcaoContaRuim = pagamentoContaInvalida(balcaoPagamentos, balcaoFormas, balcaoContas);
    if (balcaoContaRuim) {
      setBalcaoErro(`Selecione a conta bancária de destino para "${balcaoContaRuim.forma || "a forma eletrônica"}" — formas que não são dinheiro não podem cair no Caixa em Dinheiro.`);
      return;
    }
    setLoading(true);
    setBalcaoErro("");
    try {
      const res = await fetch(`/api/pedidos-venda/${pedido.id}/balcao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localEstoqueId: balcaoLocalId,
          pagamentos: pagamentosPayload(balcaoPagamentos, balcaoFormas),
          dataRecebimento: balcaoData,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setBalcaoErro(json.error ?? "Não foi possível concluir a venda."); return; }
      setBalcaoOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  // Registrar recebimento SEM entregar (cliente paga, entrega será agendada).
  const [recebOpen, setRecebOpen] = useState(false);
  const [recebData, setRecebData] = useState(todayInput());
  const [recebErro, setRecebErro] = useState("");
  const [recebPagamentos, setRecebPagamentos] = useState<LinhaPagamento[]>([novaLinhaPagamento()]);

  function abrirReceber() {
    setRecebErro("");
    setRecebData(todayInput());
    setRecebPagamentos([novaLinhaPagamento(pedido.formaPagamento ?? "", contaPadraoParaForma(pedido.formaPagamento ?? "", balcaoFormas, balcaoContas), balcaoTotal > 0 ? balcaoTotal.toFixed(2).replace(".", ",") : "")]);
    setRecebOpen(true);
    fetch("/api/suprimentos/formas-pagamento").then((r) => r.json()).then((j) => setBalcaoFormas(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
    fetch("/api/financeiro/contas").then((r) => r.json()).then((j) => setBalcaoContas(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
  }

  async function registrarRecebimento() {
    if (!recebData) { setRecebErro("Confirme a data do recebimento."); return; }
    if (!pagamentosValidos(recebPagamentos, balcaoFormas, balcaoTotal)) {
      setRecebErro("Confira as formas de pagamento — a soma precisa cobrir o total (troco só em dinheiro).");
      return;
    }
    const recebContaRuim = pagamentoContaInvalida(recebPagamentos, balcaoFormas, balcaoContas);
    if (recebContaRuim) {
      setRecebErro(`Selecione a conta bancária de destino para "${recebContaRuim.forma || "a forma eletrônica"}" — formas que não são dinheiro não podem cair no Caixa em Dinheiro.`);
      return;
    }
    setLoading(true);
    setRecebErro("");
    try {
      const res = await fetch(`/api/pedidos-venda/${pedido.id}/receber`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagamentos: pagamentosPayload(recebPagamentos, balcaoFormas), dataRecebimento: recebData }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setRecebErro(json.error ?? "Não foi possível registrar o recebimento."); return; }
      setRecebOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  // Confirmar SAÍDA do material (venda balcão em duas etapas): o cliente já
  // comprou/pagou e só agora retira a mercadoria — baixa estoque e conclui.
  const [saidaOpen, setSaidaOpen] = useState(false);
  const [saidaLocalId, setSaidaLocalId] = useState("");
  const [saidaData, setSaidaData] = useState(todayInput());
  const [saidaErro, setSaidaErro] = useState("");
  // Vai sair TODO o material (saída direta) ou parcial (controlar por minuta)?
  const [saidaTudo, setSaidaTudo] = useState<"tudo" | "parcial" | null>(null);

  function abrirSaida() {
    setSaidaErro("");
    setSaidaData(todayInput());
    setSaidaTudo(null);
    setSaidaOpen(true);
    fetch("/api/suprimentos/locais-estoque")
      .then((r) => r.json())
      .then((j) => {
        const locais = Array.isArray(j) ? j : (j.data ?? []);
        setBalcaoLocais(locais);
        if (locais.length === 1) setSaidaLocalId(locais[0].id);
      })
      .catch(() => {});
  }

  async function confirmarSaida() {
    if (!saidaLocalId) { setSaidaErro("Informe o local de estoque da retirada."); return; }
    if (!saidaData) { setSaidaErro("Confirme a data da saída."); return; }
    setLoading(true);
    setSaidaErro("");
    try {
      const res = await fetch(`/api/pedidos-venda/${pedido.id}/entregar-balcao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localEstoqueId: saidaLocalId, dataSaida: saidaData }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setSaidaErro(json.error ?? "Não foi possível registrar a saída do material."); return; }
      setSaidaOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  // Receber um título do pedido (baixa de contas a receber direto pelo detalhe).
  const [crAlvo, setCrAlvo] = useState<{ id: string; numero: string; saldo: number } | null>(null);
  const [crValor, setCrValor] = useState("");
  const [crData, setCrData] = useState(todayInput());
  const [crForma, setCrForma] = useState("");
  const [crContaId, setCrContaId] = useState("");
  const [crErro, setCrErro] = useState("");

  function abrirReceberTitulo(c: PedidoDetailProps["pedido"]["contasReceber"][number]) {
    const saldo = decimalToNumber(c.valorOriginal) - decimalToNumber(c.valorPago);
    setCrAlvo({ id: c.id, numero: c.numero, saldo });
    setCrValor(saldo > 0 ? saldo.toFixed(2).replace(".", ",") : "");
    setCrData(todayInput());
    setCrForma(pedido.formaPagamento ?? "");
    setCrContaId("");
    setCrErro("");
    fetch("/api/suprimentos/formas-pagamento").then((r) => r.json()).then((j) => setBalcaoFormas(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
    fetch("/api/financeiro/contas").then((r) => r.json()).then((j) => {
      const cs = Array.isArray(j) ? j : (j.data ?? []);
      setBalcaoContas(cs);
      setCrContaId(contaCaixaPadrao(cs));
    }).catch(() => {});
  }

  async function receberTitulo() {
    if (!crAlvo) return;
    const valor = parseValorBR(crValor);
    if (valor <= 0) { setCrErro("Informe o valor recebido."); return; }
    if (!crData) { setCrErro("Confirme a data do recebimento."); return; }
    setLoading(true);
    setCrErro("");
    try {
      const res = await fetch(`/api/contas-receber/${crAlvo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valorPago: valor, dataPagamento: crData, formaPagamento: crForma || null, contaBancariaId: crContaId || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setCrErro(j.error ?? "Não foi possível registrar o recebimento."); return; }
      setCrAlvo(null);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  // Estorna o recebimento de um título: volta para "em aberto" e remove o
  // lançamento no caixa/banco.
  async function estornarTitulo(c: PedidoDetailProps["pedido"]["contasReceber"][number]) {
    if (!confirm(`Estornar o recebimento do título ${c.numero}? Ele volta para "em aberto" e o lançamento no caixa/banco é removido.`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/contas-receber/${c.id}/estorno`, { method: "POST" });
      if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? "Não foi possível estornar."); return; }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  // Comodato (saída) form state
  const [comodatoItemId, setComodatoItemId] = useState("");
  const [comodatoQtd, setComodatoQtd] = useState("");
  const [comodatoValor, setComodatoValor] = useState("");
  const [comodatoData, setComodatoData] = useState(todayInput());
  const [comodatoDoc, setComodatoDoc] = useState("");
  const [comodatoObs, setComodatoObs] = useState("");

  const actions = NEXT_STATUS[pedido.status] ?? [];
  const minutas = pedido.minutas ?? [];

  // Comodato totals for this pedido (SAÍDA +, RETORNO −)
  const comodatoTotalQtd = movimentacoesComodato.reduce((s, m) => s + (m.tipo === "SAIDA" ? 1 : -1) * m.quantidade, 0);
  const comodatoTotalValor = movimentacoesComodato.reduce((s, m) => s + (m.tipo === "SAIDA" ? 1 : -1) * m.quantidade * m.valorUnitario, 0);

  // Subtotal BRUTO (Σ qtd × preço) e desconto total (descontos de linha + desconto
  // do pedido) — assim o desconto dado por item aparece no detalhamento em vez de
  // ficar embutido no subtotal (que é líquido em valorProdutos).
  const subtotalBruto = pedido.itens.reduce(
    (s, it) => s + decimalToNumber(it.quantidade) * decimalToNumber(it.precoUnitario), 0);
  const descontoTotal = pedido.itens.reduce((s, it) => s + decimalToNumber(it.desconto), 0)
    + decimalToNumber(pedido.valorDesconto);
  // Parcela de comodato embutida no Total persistido. Derivada do próprio total
  // para o detalhamento sempre fechar (Subtotal − Desconto + Frete + Comodato = Total),
  // inclusive em pedidos antigos cujo total ainda não incluía o comodato (→ ≈ 0).
  const comodatoNoTotal =
    decimalToNumber(pedido.valorTotal) -
    subtotalBruto +
    descontoTotal -
    decimalToNumber(pedido.valorFrete);
  // Editing allowed up to and including scheduling. Note: saving fails at the DB
  // if items are already linked to minutas (FK Restrict), which protects deliveries.
  // Admin pode editar mesmo concluído/cancelado (assume a responsabilidade —
  // o estoque/financeiro já lançados não são recalculados pela edição).
  const canEdit =
    isAdmin ||
    pedido.status === "ORCAMENTO" ||
    pedido.status === "CONFIRMADO" ||
    pedido.status === "EM_AGENDAMENTO";

  async function changeStatus(next: string, dataConclusao?: string, override?: boolean) {
    setLoading(true);
    try {
      const res = await fetch(`/api/pedidos-venda/${pedido.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, ...(dataConclusao ? { dataConclusao } : {}), ...(override ? { override: true } : {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBlockModal({
          msg: json.error ?? "Não foi possível alterar o status do pedido.",
          pendentes: Array.isArray(json.pendentes) ? json.pendentes : [],
        });
        return;
      }
      setConcluirOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function gerarContaReceber() {
    setLoading(true);
    await fetch("/api/contas-receber", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteId: pedido.cliente.id,
        pedidoVendaId: pedido.id,
        descricao: `Faturamento pedido ${pedido.numero}`,
        valorOriginal: decimalToNumber(pedido.valorTotal),
        dataVencimento: pedido.dataEntrega
          ? new Date(pedido.dataEntrega).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
      }),
    });
    setLoading(false);
    router.refresh();
  }

  function onComodatoItemChange(id: string) {
    setComodatoItemId(id);
    const it = itensComodato.find((i) => i.id === id);
    if (it) setComodatoValor(String(it.precoVenda));
  }

  async function lancarComodato() {
    if (!comodatoItemId || !comodatoQtd) return;
    setLoading(true);
    await fetch("/api/comodato", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteId: pedido.cliente.id,
        pedidoVendaId: pedido.id,
        itemId: comodatoItemId,
        tipo: "SAIDA",
        quantidade: parseDecimal(comodatoQtd),
        valorUnitario: comodatoValor ? parseDecimal(comodatoValor) : undefined,
        data: comodatoData,
        documento: comodatoDoc || undefined,
        observacoes: comodatoObs || undefined,
      }),
    });
    setComodatoItemId("");
    setComodatoQtd("");
    setComodatoValor("");
    setComodatoData(todayInput());
    setComodatoDoc("");
    setComodatoObs("");
    setLoading(false);
    router.refresh();
  }

  async function removerComodato(id: string) {
    if (!confirm("Remover este lançamento de comodato?")) return;
    setLoading(true);
    await fetch(`/api/comodato/${id}`, { method: "DELETE" });
    setLoading(false);
    router.refresh();
  }

  // Calculate balance per item
  function getSaldo(pvItem: ItemRow): number {
    const total = decimalToNumber(pvItem.quantidade);
    const minutado = pvItem.minutaItens.reduce((s, mi) => s + parseFloat(mi.quantidade.toString()), 0);
    return Math.max(total - minutado, 0);
  }

  function getEntregue(pvItem: ItemRow): number {
    const entregueMinutas = minutas.filter(m => m.status === "ENTREGUE");
    return entregueMinutas
      .flatMap(m => m.itens)
      .filter(mi => mi.pedidoVendaItemId === pvItem.id)
      .reduce((s, mi) => s + parseFloat(mi.quantidade.toString()), 0);
  }

  // Há material pedido ainda não entregue (mesmo critério do bloqueio de conclusão).
  const temSaldoPendente = pedido.itens.some(
    (it) => decimalToNumber(it.quantidade) - getEntregue(it) > 0.0001,
  );

  function abrirConcluir() {
    setConcluirErro("");
    setConcluirData(todayInput());
    setConcluirRetirado(null);
    setConcluirLocalId("");
    if (temSaldoPendente) {
      fetch("/api/suprimentos/locais-estoque")
        .then((r) => r.json())
        .then((j) => {
          const l = Array.isArray(j) ? j : (j.data ?? []);
          setBalcaoLocais(l);
          if (l.length === 1) setConcluirLocalId(l[0].id);
        })
        .catch(() => {});
    }
    setConcluirOpen(true);
  }

  async function concluir() {
    if (!concluirData) { setConcluirErro("Confirme a data de conclusão."); return; }
    // Sem saldo pendente: conclusão normal.
    if (!temSaldoPendente) { changeStatus("CONCLUIDO", concluirData); return; }
    // Com saldo pendente: exige confirmar que os materiais já foram retirados.
    if (concluirRetirado !== "sim") {
      setConcluirErro("Há saldo a entregar. Confirme que os materiais já foram retirados ou conclua as entregas antes.");
      return;
    }
    if (!concluirLocalId) { setConcluirErro("Informe o local de estoque da retirada."); return; }
    setLoading(true);
    setConcluirErro("");
    try {
      const res = await fetch(`/api/pedidos-venda/${pedido.id}/concluir-com-saida`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localEstoqueId: concluirLocalId, dataConclusao: concluirData }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setConcluirErro(j.error ?? "Não foi possível concluir o pedido."); return; }
      setConcluirOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const origemEmpresaNome = pedido.estoqueOrigemEmpresa
    ? (pedido.estoqueOrigemEmpresa.nomeFantasia || pedido.estoqueOrigemEmpresa.razaoSocial)
    : null;
  const entregasTriangular = pedido.entregasTriangular ?? [];
  const vendaOrigemNome = pedido.pedidoVendaOrigem?.empresa
    ? (pedido.pedidoVendaOrigem.empresa.nomeFantasia || pedido.pedidoVendaOrigem.empresa.razaoSocial)
    : null;

  return (
    <div className="space-y-6">
      {/* Venda à ordem (triangular) — banners de origem/entrega */}
      {origemEmpresaNome && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-warning/30 bg-warning/10 text-sm text-warning">
          <Truck className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Venda à ordem.</span>{" "}
            Quem entrega e baixa o estoque é a <span className="font-semibold">{origemEmpresaNome}</span>
            {entregasTriangular.length > 0 ? (
              <>
                {" "}— pedido{entregasTriangular.length > 1 ? "s" : ""} de entrega{" "}
                {entregasTriangular.map((e, i) => (
                  <span key={e.id}>
                    {i > 0 && ", "}
                    <span className="font-mono font-semibold">{e.numero}</span>
                    {e.empresa && <> ({e.empresa.nomeFantasia || e.empresa.razaoSocial})</>}
                  </span>
                ))}
              </>
            ) : (
              <> (criado ao confirmar a venda)</>
            )}.
            {pedido.precoTransferencia != null && <> Preço de transferência: <span className="font-semibold">{formatBRL(decimalToNumber(pedido.precoTransferencia))}</span>.</>}
          </div>
        </div>
      )}
      {vendaOrigemNome && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-info/30 bg-info/10 text-sm text-info">
          <Package className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Pedido de entrega (venda à ordem).</span>{" "}
            Origem: venda <span className="font-mono font-semibold">{pedido.pedidoVendaOrigem?.numero}</span> da <span className="font-semibold">{vendaOrigemNome}</span>. Entregue e baixe o estoque normalmente aqui.
          </div>
        </div>
      )}

      {/* Actions bar */}
      {(actions.length > 0 || canEdit || isAdmin || pedido.status === "CONCLUIDO" || (pedido.status === "EM_AGENDAMENTO" && pedido.contasReceber.length === 0)) && (
        <div className="flex items-center gap-2 p-4 bg-muted rounded-xl border border-border">
          <span className="text-sm text-muted-foreground mr-2">Ações:</span>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => replaceCurrentTab(`/pedidos-venda/${pedido.id}/editar`)} disabled={loading} className="gap-1.5">
              <Pencil className="w-3.5 h-3.5" />
              Editar
            </Button>
          )}
          {(pedido.status === "ORCAMENTO" || pedido.status === "CONFIRMADO") &&
            !pedido.intragrupo &&
            !pedido.estoqueOrigemEmpresa &&
            minutas.filter((m) => m.status !== "CANCELADA").length === 0 && (
            <Button size="sm" onClick={abrirBalcao} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
              <Package className="w-4 h-4 mr-1.5" />
              Venda Balcão
            </Button>
          )}
          {/* Receber agora, entregar depois: paga sem baixar estoque, segue p/ minutas */}
          {pedido.status !== "CONCLUIDO" && pedido.status !== "CANCELADO" &&
            !pedido.intragrupo && pedido.contasReceber.length === 0 && (
            <Button variant="outline" size="sm" onClick={abrirReceber} disabled={loading} className="gap-1.5 border-success/30 text-success hover:bg-success/10">
              <Package className="w-3.5 h-3.5" />
              Registrar Recebimento
            </Button>
          )}
          {/* Atalho "entregar tudo agora": quando o cliente leva/recebe tudo de
              uma vez, cria UMA minuta cheia (retirada ou entrega, conforme o
              pedido), baixa o estoque e conclui. A parcial é feita por minutas. */}
          {pedido.status !== "CONCLUIDO" && pedido.status !== "CANCELADO" &&
            !pedido.intragrupo && !pedido.estoqueOrigemEmpresa &&
            minutas.filter((m) => m.status !== "CANCELADA").length === 0 && (
            <Button size="sm" onClick={abrirSaida} disabled={loading} className="bg-amber-600 hover:bg-amber-700 gap-1.5">
              <Truck className="w-4 h-4" />
              {pedido.necessidadeEntrega === "RETIRADA" ? "Confirmar retirada (tudo)" : "Entregar tudo agora"}
            </Button>
          )}
          {actions.map((a) => (
            <Button
              key={a.next}
              variant={a.variant ?? "default"}
              size="sm"
              onClick={() => {
                if (a.next === "CONCLUIDO") { abrirConcluir(); }
                else changeStatus(a.next);
              }}
              disabled={loading}
            >
              {a.label}
            </Button>
          ))}
          {pedido.status === "EM_AGENDAMENTO" && pedido.contasReceber.length === 0 && !pedido.pedidoVendaOrigem && (
            <Button variant="outline" size="sm" onClick={gerarContaReceber} disabled={loading}>
              Gerar Conta a Receber
            </Button>
          )}
          {/* Devolução de material: disponível após a conclusão do pedido. */}
          {pedido.status === "CONCLUIDO" && (
            <DevolucaoButton pedidoVendaId={pedido.id} pedidoNumero={pedido.numero} onDone={() => router.refresh()} />
          )}
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={loading} className="ml-auto gap-1.5" />}>
                <RefreshCw className="w-3.5 h-3.5" /> Alterar status <ChevronDown className="w-3.5 h-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {STATUS_PEDIDO.filter((s) => s.value !== pedido.status).map((s) => (
                  <DropdownMenuItem
                    key={s.value}
                    onClick={() => {
                      if (confirm(`Forçar o status do pedido para "${s.label}"? Esta é uma ação administrativa e ignora o fluxo normal.`)) {
                        changeStatus(s.value, undefined, true);
                      }
                    }}
                  >
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {isAdmin && (
            <Button
              variant="outline" size="sm"
              onClick={() => { setExcluirErro(""); setExcluirOpen(true); }}
              disabled={loading}
              className="gap-1.5 border-danger/30 text-danger hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir
            </Button>
          )}
        </div>
      )}

      {/* Abas principais: Informações | Minutas | Pagamento */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setMainTab("informacoes")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            mainTab === "informacoes" ? "border-blue-600 text-info" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          Informações
        </button>
        <button
          onClick={() => setMainTab("minutas")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2",
            mainTab === "minutas" ? "border-blue-600 text-info" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <span>Minutas{minutas.length > 0 ? ` (${minutas.length})` : ""}</span>
          <EntregaBadge status={pedido.statusEntrega} />
        </button>
        <button
          onClick={() => setMainTab("pagamento")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2",
            mainTab === "pagamento" ? "border-blue-600 text-info" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <span>Pagamento{pedido.contasReceber.length > 0 ? ` (${pedido.contasReceber.length})` : ""}</span>
          <FinanceiroBadge status={pedido.statusFinanceiro} />
        </button>
      </div>

      {/* ── INFORMAÇÕES: dados e totais ── */}
      {mainTab === "informacoes" && (
      <div className="grid grid-cols-2 gap-6 pt-6">
        {/* Info card */}
        <Card>
          <CardHeader><CardTitle className="text-base">Informações</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground">Situação</span>
              <StatusDimBadges entrega={pedido.statusEntrega} financeiro={pedido.statusFinanceiro} className="justify-end" />
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">{pedido.clienteFinal ? "Adquirente" : "Cliente"}</span><Link href={`/clientes/${pedido.cliente.id}`} className="font-medium text-info hover:underline">{pedido.cliente.razaoSocial}</Link></div>
            {pedido.clienteFinal && (
              <div className="flex justify-between"><span className="text-muted-foreground">Destinatário</span><Link href={`/clientes/${pedido.clienteFinal.id}`} className="font-medium text-info hover:underline">{pedido.clienteFinal.razaoSocial}</Link></div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Pagamento</span>
              <span className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
                pedido.necessidadePagamento === "A_VISTA" ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
              )}>
                {pedido.necessidadePagamento === "A_VISTA" ? "À vista" : "A prazo"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Forma de entrega</span>
              <span className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
                pedido.necessidadeEntrega === "RETIRADA" ? "bg-success/15 text-success" : "bg-info/15 text-info",
              )}>
                {pedido.necessidadeEntrega === "RETIRADA" ? "Cliente retira tudo" : "Minutas manuais"}
              </span>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Vendedor</span><span>{pedido.vendedor?.nome || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Nº Orçamento</span><span>{pedido.numeroOrcamento || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Emissão</span><span>{formatDate(pedido.dataEmissao)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Conclusão</span><span>{pedido.dataConclusao ? formatDate(pedido.dataConclusao) : "—"}</span></div>
            {pedido.pagamentos && pedido.pagamentos.length > 0 ? (
              <div>
                <span className="text-muted-foreground">Forma Pagamento</span>
                <div className="mt-1 space-y-0.5">
                  {pedido.pagamentos.map((pg) => (
                    <div key={pg.id} className="flex justify-between pl-2 gap-2">
                      <span className="text-muted-foreground min-w-0 truncate">
                        {pg.forma}
                        {pg.contaBancaria && (
                          <>
                            {" → "}
                            <Link href={`/financeiro/contas/${pg.contaBancaria.id}`} className="text-info hover:underline">
                              {pg.contaBancaria.nome}
                            </Link>
                          </>
                        )}
                      </span>
                      <span className="font-medium tabular-nums shrink-0">{formatBRL(decimalToNumber(pg.valor))}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex justify-between"><span className="text-muted-foreground">Forma Pagamento</span><span>{pedido.formaPagamento || "—"}</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Cond. Pagamento</span><span>{pedido.condicaoPagamento || "—"}</span></div>
            {pedido.observacoes && <div className="pt-2 border-t"><p className="text-muted-foreground text-xs mb-1">Observações</p><p>{pedido.observacoes}</p></div>}
            <Autoria criadoPor={pedido.criadoPor} atualizadoPor={pedido.atualizadoPor} className="pt-2 border-t" />
          </CardContent>
        </Card>

        {/* Totals card */}
        <Card>
          <CardHeader><CardTitle className="text-base">Totais</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal Produtos</span><span>{formatBRL(subtotalBruto)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="text-red-500">- {formatBRL(descontoTotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span>{formatBRL(decimalToNumber(pedido.valorFrete))}</span></div>
            {Math.abs(comodatoNoTotal) > 0.005 && (
              <div className="flex justify-between"><span className="text-muted-foreground">Comodato</span><span>{formatBRL(comodatoNoTotal)}</span></div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold text-base"><span>Total</span><span>{formatBRL(decimalToNumber(pedido.valorTotal))}</span></div>
          </CardContent>
        </Card>
      </div>
      )}

      {/* ── PAGAMENTO: títulos a receber do pedido ── */}
      {mainTab === "pagamento" && (
        pedido.contasReceber.length > 0 ? (
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Contas a Receber</CardTitle>
            <FinanceiroBadge status={pedido.statusFinanceiro} />
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 font-medium">Título</th>
                    <th className="py-2 font-medium">Parcela</th>
                    <th className="py-2 font-medium">Vencimento</th>
                    <th className="py-2 font-medium text-right">Valor</th>
                    <th className="py-2 font-medium text-right">Recebido</th>
                    <th className="py-2 font-medium">Situação</th>
                    <th className="py-2 font-medium text-right" />
                  </tr>
                </thead>
                <tbody>
                  {pedido.contasReceber.map((c) => {
                    const saldo = decimalToNumber(c.valorOriginal) - decimalToNumber(c.valorPago);
                    const podeReceber = c.status !== "PAGA" && c.status !== "CANCELADA";
                    const podeEstornar = c.status === "PAGA" || c.status === "PARCIAL";
                    return (
                      <tr key={c.id} className="border-b border-gray-50">
                        <td className="py-2.5 font-mono text-xs text-foreground">{c.numero}</td>
                        <td className="py-2.5 text-muted-foreground">{c.parcelaTotal && c.parcelaTotal > 1 ? `${c.parcelaNumero}/${c.parcelaTotal}` : "—"}</td>
                        <td className="py-2.5 text-muted-foreground">{c.dataVencimento ? formatDate(c.dataVencimento) : <span className="text-muted-foreground italic">sem previsão</span>}</td>
                        <td className="py-2.5 text-right tabular-nums">{formatBRL(decimalToNumber(c.valorOriginal))}</td>
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">{formatBRL(decimalToNumber(c.valorPago))}</td>
                        <td className="py-2.5"><StatusBadge status={c.status} /></td>
                        <td className="py-2.5 text-right">
                          <div className="flex justify-end gap-1">
                            {podeReceber && (
                              <Button size="sm" variant="outline" onClick={() => abrirReceberTitulo(c)} disabled={loading}
                                className="h-7 gap-1 border-success/30 text-success hover:bg-success/10">
                                Receber{saldo > 0 ? ` ${formatBRL(saldo)}` : ""}
                              </Button>
                            )}
                            {podeEstornar && (
                              <Button size="sm" variant="ghost" onClick={() => estornarTitulo(c)} disabled={loading}
                                className="h-7 gap-1 text-amber-600 hover:text-amber-700">
                                Estornar
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-10">Nenhum título a receber gerado para este pedido ainda.</p>
        )
      )}

      {/* ── INFORMAÇÕES (cont.): sub-abas Itens | Comodato ── */}
      {mainTab === "informacoes" && (
      <div className="pt-6">
        <div className="flex items-center border-b border-border mb-0">
          <button
            onClick={() => setActiveTab("itens")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === "itens"
                ? "border-blue-600 text-info"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Itens ({pedido.itens.length})
          </button>
          <button
            onClick={() => setActiveTab("comodato")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5",
              activeTab === "comodato"
                ? "border-blue-600 text-info"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Package className="w-3.5 h-3.5" />
            Comodato {movimentacoesComodato.length > 0 && `(${movimentacoesComodato.length})`}
          </button>
        </div>

        {/* ITENS TAB */}
        {activeTab === "itens" && (
          <Card className="rounded-tl-none border-t-0 rounded-tl-none" style={{ borderTopLeftRadius: 0 }}>
            <CardContent className="pt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground uppercase">
                    <th className="text-left pb-2">Código</th>
                    <th className="text-left pb-2">Descrição</th>
                    <th className="text-center pb-2">Un.</th>
                    <th className="text-right pb-2">Qtd</th>
                    <th className="text-right pb-2">Entregue</th>
                    <th className="text-right pb-2">Saldo</th>
                    <th className="text-right pb-2">Preço Unit.</th>
                    <th className="text-right pb-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pedido.itens.map((item) => {
                    const entregue = getEntregue(item);
                    const saldo = getSaldo(item);
                    return (
                      <tr key={item.id} className="border-b border-gray-50 hover:bg-muted">
                        <td className="py-2.5 font-mono text-xs">{item.item.codigo}</td>
                        <td className="py-2.5">
                          {item.item.descricao}
                          {item.estoqueOrigemEmpresa && (
                            <span
                              className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-500/30 align-middle"
                              title="Origem do estoque desta linha (venda à ordem por item)"
                            >
                              de {item.estoqueOrigemEmpresa.nomeFantasia || item.estoqueOrigemEmpresa.razaoSocial}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-center text-muted-foreground text-xs">{item.item.unidade?.sigla ?? item.item.unidadeMedida}</td>
                        <td className="py-2.5 text-right tabular-nums">{fmtQty(item.quantidade)}</td>
                        <td className="py-2.5 text-right tabular-nums text-success">{fmtQty(entregue)}</td>
                        <td className="py-2.5 text-right tabular-nums font-semibold">
                          <span className={saldo === 0 ? "text-muted-foreground" : "text-foreground"}>
                            {fmtQty(saldo)}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">{formatBRL(decimalToNumber(item.precoUnitario))}</td>
                        <td className="py-2.5 text-right font-medium">{formatBRL(decimalToNumber(item.valorTotal))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* COMODATO TAB */}
        {activeTab === "comodato" && (
          <Card style={{ borderTopLeftRadius: 0 }}>
            <CardContent className="pt-4 space-y-5">
              {/* Formulário de saída — liberado a qualquer usuário, pois fica amarrado ao pedido */}
              <div className="rounded-xl border border-border bg-muted/60 p-4 space-y-4">
                <p className="text-sm font-medium text-foreground">Registrar saída de comodato (cliente levando)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Item em Comodato</label>
                    <ComboboxWithCreate
                      value={comodatoItemId}
                      onChange={(v) => onComodatoItemChange(v)}
                      placeholder="Selecione..."
                      noneLabel="Selecione..."
                      triggerClassName="h-10 rounded-lg"
                      options={itensComodato.map((i) => ({ value: i.id, label: `${i.codigo} — ${i.descricao}` }))}
                    />
                    {itensComodato.length === 0 && (
                      <p className="text-xs text-warning mt-1">
                        Nenhum item marcado como comodato. Marque a opção &quot;Comodato&quot; no cadastro do item.
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Qtd</label>
                      <input
                        inputMode="decimal"
                        value={comodatoQtd}
                        onChange={(e) => setComodatoQtd(e.target.value)}
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Valor un. (R$)</label>
                      <input
                        inputMode="decimal"
                        value={comodatoValor}
                        onChange={(e) => setComodatoValor(e.target.value)}
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Data</label>
                      <DatePicker
                        value={comodatoData}
                        onChange={(v) => setComodatoData(v)}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Documento (opcional)</label>
                    <input
                      type="text"
                      value={comodatoDoc}
                      onChange={(e) => setComodatoDoc(e.target.value)}
                      placeholder="Ex: nota, romaneio..."
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Observações (opcional)</label>
                    <input
                      type="text"
                      value={comodatoObs}
                      onChange={(e) => setComodatoObs(e.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={lancarComodato} disabled={loading || !comodatoItemId || !comodatoQtd} className="gap-1.5 font-semibold">
                    <Plus className="w-4 h-4" />
                    Lançar saída
                  </Button>
                </div>
              </div>

              {/* Lançamentos deste pedido */}
              {movimentacoesComodato.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum comodato lançado para este pedido.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground uppercase">
                      <th className="text-left pb-2">Data</th>
                      <th className="text-left pb-2">Item em Comodato</th>
                      <th className="text-right pb-2">Qtd</th>
                      <th className="text-right pb-2">Valor Un.</th>
                      <th className="text-right pb-2">Total</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimentacoesComodato.map((m) => (
                      <tr key={m.id} className="border-b border-gray-50 hover:bg-muted">
                        <td className="py-2.5 text-muted-foreground">{fmtDate(m.data)}</td>
                        <td className="py-2.5">{m.item.codigo} — {m.item.descricao}</td>
                        <td className="py-2.5 text-right tabular-nums">{fmtNum(m.quantidade)}</td>
                        <td className="py-2.5 text-right">{formatBRL(m.valorUnitario)}</td>
                        <td className="py-2.5 text-right font-medium">{formatBRL(m.quantidade * m.valorUnitario)}</td>
                        <td className="py-2.5 text-right">
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => removerComodato(m.id)}
                            disabled={loading}
                            className="h-7 w-7 text-muted-foreground hover:text-danger"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="py-2.5" colSpan={2}>Total</td>
                      <td className="py-2.5 text-right tabular-nums">{fmtNum(comodatoTotalQtd)}</td>
                      <td></td>
                      <td className="py-2.5 text-right">{formatBRL(comodatoTotalValor)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      )}

      {/* ── MINUTAS: entregas do pedido ── */}
      {mainTab === "minutas" && (
        <Card className="mt-6">
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {minutas.length === 0
                  ? "Nenhuma minuta criada para este pedido."
                  : `${minutas.length} minuta${minutas.length !== 1 ? "s" : ""}`
                }
              </p>
              <Button
                size="sm"
                onClick={() => router.push(`/comercial/minutas/nova?pedidoVendaId=${pedido.id}`)}
                className="gap-1.5 font-semibold"
              >
                <Plus className="w-4 h-4" />
                Nova Minuta
              </Button>
            </div>

            {minutas.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground uppercase">
                    <th className="text-left pb-2">Número</th>
                    <th className="text-left pb-2">Nº Físico</th>
                    <th className="text-left pb-2">Status</th>
                    <th className="text-left pb-2">Emissão</th>
                    <th className="text-left pb-2">Entrega</th>
                    <th className="text-left pb-2">Motorista</th>
                    <th className="text-left pb-2">Local</th>
                    <th className="text-right pb-2">Itens</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {minutas.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-gray-50 hover:bg-muted cursor-pointer"
                      onClick={() => router.push(`/comercial/minutas/${m.id}`)}
                    >
                      <td className="py-2.5 font-mono font-semibold text-info hover:underline">{m.numero}</td>
                      <td className="py-2.5 font-mono text-muted-foreground">{m.numeroFisico || "—"}</td>
                      <td className="py-2.5">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold", STATUS_COLOR[m.status])}>
                          {STATUS_LABEL[m.status]}
                        </span>
                      </td>
                      <td className="py-2.5 text-muted-foreground">{fmtDate(m.dataEmissao)}</td>
                      <td className="py-2.5 text-muted-foreground">{fmtDate(m.dataEntrega)}</td>
                      <td className="py-2.5 text-muted-foreground">{m.motorista?.nome ?? "—"}</td>
                      <td className="py-2.5 text-muted-foreground">{m.localEstoque?.nome ?? "—"}</td>
                      <td className="py-2.5 text-right text-muted-foreground">{m.itens.length}</td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                          <MinutaActionsMenu id={m.id} numero={m.numero} status={m.status} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Saldo per item summary */}
            {pedido.itens.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Saldo por Item</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase border-b">
                      <th className="text-left pb-1.5">Produto</th>
                      <th className="text-right pb-1.5">Pedido</th>
                      <th className="text-right pb-1.5">Minutado</th>
                      <th className="text-right pb-1.5">Entregue</th>
                      <th className="text-right pb-1.5">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedido.itens.map((pvItem) => {
                      const total = decimalToNumber(pvItem.quantidade);
                      const minutado = pvItem.minutaItens.reduce((s, mi) => s + parseFloat(mi.quantidade.toString()), 0);
                      const entregue = getEntregue(pvItem);
                      const saldo = Math.max(total - minutado, 0);
                      return (
                        <tr key={pvItem.id} className="border-b border-gray-50">
                          <td className="py-2 text-foreground">{pvItem.item.descricao}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">{fmtQty(total)}</td>
                          <td className="py-2 text-right tabular-nums text-info">{fmtQty(minutado)}</td>
                          <td className="py-2 text-right tabular-nums text-success">{fmtQty(entregue)}</td>
                          <td className="py-2 text-right tabular-nums font-semibold">
                            <span className={saldo === 0 ? "text-muted-foreground" : "text-foreground"}>{fmtQty(saldo)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ModalPortal>
      {balcaoOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !loading && setBalcaoOpen(false)}
        >
          <div
            className="bg-card rounded-2xl border border-border shadow-2xl p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="font-bold text-foreground">Venda Balcão — receber e concluir</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Baixa o estoque agora (retirada na loja), registra o recebimento de{" "}
                <span className="font-semibold">{formatBRL(decimalToNumber(pedido.valorTotal))}</span> e conclui o pedido.
              </p>
            </div>
            {balcaoErro && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">{balcaoErro}</p>}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Local de Estoque <span className="text-red-500">*</span></label>
                <ComboboxWithCreate
                  value={balcaoLocalId}
                  onChange={(v) => setBalcaoLocalId(v)}
                  noneLabel="— Selecionar local —"
                  triggerClassName="h-10 rounded-lg"
                  options={balcaoLocais.map((l) => ({ value: l.id, label: l.nome }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Data do Recebimento <span className="text-red-500">*</span></label>
                <DatePicker
                  value={balcaoData}
                  onChange={(v) => setBalcaoData(v)}
                  className="w-full"
                />
                <p className="text-[11px] text-muted-foreground">Vale para a baixa de estoque, o recebimento no caixa e a conclusão do pedido.</p>
              </div>
            </div>
            {/* Formas de pagamento (misto: PIX + dinheiro etc.) */}
            <PagamentosInput linhas={balcaoPagamentos} setLinhas={setBalcaoPagamentos} formas={balcaoFormas} contas={balcaoContas} total={balcaoTotal} usarMaquinetas />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setBalcaoOpen(false)} disabled={loading}>Cancelar</Button>
              <Button onClick={concluirBalcao} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 font-semibold">
                {loading ? "Concluindo..." : "Receber e Concluir"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {recebOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !loading && setRecebOpen(false)}
        >
          <div
            className="bg-card rounded-2xl border border-border shadow-2xl p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="font-bold text-foreground">Registrar recebimento</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Registra o pagamento de <span className="font-semibold">{formatBRL(decimalToNumber(pedido.valorTotal))}</span> no
                caixa <span className="font-semibold">sem baixar o estoque</span> — a entrega será agendada depois (minutas).
              </p>
            </div>
            {recebErro && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">{recebErro}</p>}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Data do Recebimento <span className="text-red-500">*</span></label>
              <DatePicker
                value={recebData}
                onChange={(v) => setRecebData(v)}
                className="w-full"
              />
            </div>
            <PagamentosInput linhas={recebPagamentos} setLinhas={setRecebPagamentos} formas={balcaoFormas} contas={balcaoContas} total={balcaoTotal} />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setRecebOpen(false)} disabled={loading}>Cancelar</Button>
              <Button onClick={registrarRecebimento} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 font-semibold">
                {loading ? "Registrando..." : "Registrar recebimento"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {saidaOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !loading && setSaidaOpen(false)}
        >
          <div
            className="bg-card rounded-2xl border border-border shadow-2xl p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="font-bold text-foreground">Confirmar saída do material</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {pedido.necessidadeEntrega === "RETIRADA"
                  ? "O cliente está retirando a mercadoria agora. Baixa o estoque (minuta de retirada)"
                  : "Saída total do material ao cliente agora. Baixa o estoque (minuta de entrega)"}
                {" "}e conclui o pedido — <span className="font-semibold">sem mexer no financeiro</span>
                {pedido.contasReceber.length > 0 ? " (o recebimento já foi lançado)." : " (registre o recebimento à parte, se ainda não foi)."}
              </p>
            </div>
            {saidaErro && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">{saidaErro}</p>}

            {/* Pergunta: vai sair tudo ou parcial? */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Vai sair todo o material do pedido?</p>
              <div className="flex gap-2">
                <Button size="sm" variant={saidaTudo === "tudo" ? "default" : "outline"}
                  onClick={() => { setSaidaErro(""); setSaidaTudo("tudo"); }}
                  className={saidaTudo === "tudo" ? "bg-amber-600 hover:bg-amber-700" : ""}>
                  Sim, sai tudo
                </Button>
                <Button size="sm" variant={saidaTudo === "parcial" ? "default" : "outline"}
                  onClick={() => { setSaidaErro(""); setSaidaTudo("parcial"); }}>
                  Não, parcial
                </Button>
              </div>
            </div>

            {saidaTudo === "parcial" && (
              <div className="rounded-xl border border-info/30 bg-info/10 p-3 space-y-2">
                <p className="text-sm text-info">
                  Para saída parcial, controle por <span className="font-semibold">minuta</span>: escolha os itens e
                  as quantidades que vão sair agora. O restante continua como saldo a entregar.
                </p>
                <Button size="sm" onClick={() => replaceCurrentTab(`/comercial/minutas/nova?pedidoVendaId=${pedido.id}`)} className="gap-1.5">
                  <Truck className="w-4 h-4" /> Controlar por minuta
                </Button>
              </div>
            )}

            {saidaTudo === "tudo" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Local de Estoque <span className="text-red-500">*</span></label>
                  <ComboboxWithCreate
                    value={saidaLocalId}
                    onChange={(v) => setSaidaLocalId(v)}
                    noneLabel="— Selecionar local —"
                    triggerClassName="h-10 rounded-lg"
                    options={balcaoLocais.map((l) => ({ value: l.id, label: l.nome }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Data da Saída <span className="text-red-500">*</span></label>
                  <DatePicker
                    value={saidaData}
                    onChange={(v) => setSaidaData(v)}
                    className="w-full"
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setSaidaOpen(false)} disabled={loading}>Cancelar</Button>
              <Button onClick={confirmarSaida} disabled={loading || saidaTudo !== "tudo"} className="bg-amber-600 hover:bg-amber-700 font-semibold">
                {loading ? "Registrando..." : "Confirmar saída"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {crAlvo && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onClick={() => !loading && setCrAlvo(null)}>
          <div className="bg-card rounded-2xl border border-border shadow-2xl p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="font-bold text-foreground">Receber título {crAlvo.numero}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Registra o recebimento (parcial ou total) e lança no caixa.</p>
            </div>
            {crErro && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">{crErro}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Valor recebido <span className="text-red-500">*</span></label>
                <input value={crValor} onChange={(e) => setCrValor(e.target.value)} placeholder="0,00"
                  className="w-full h-10 rounded-lg border border-border px-3 text-sm text-right font-mono bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Data <span className="text-red-500">*</span></label>
                <DatePicker value={crData} onChange={(v) => setCrData(v)} className="w-full" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Forma de pagamento</label>
              <ComboboxWithCreate value={crForma} onChange={setCrForma} placeholder="— Selecionar —" noneLabel="Selecionar" triggerClassName="h-10 rounded-lg"
                options={[
                  ...(crForma && !balcaoFormas.some((f) => f.nome === crForma) ? [{ value: crForma, label: crForma }] : []),
                  ...balcaoFormas.filter((f) => f.ativo !== false).map((f) => ({ value: f.nome, label: f.nome })),
                ]} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Conta de destino</label>
              <ComboboxWithCreate value={crContaId} onChange={setCrContaId} placeholder="Selecione" noneLabel="Selecione" triggerClassName="h-10 rounded-lg"
                options={balcaoContas.filter((c) => c.ativo !== false).map((c) => ({ value: c.id, label: c.nome }))} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setCrAlvo(null)} disabled={loading}>Cancelar</Button>
              <Button onClick={receberTitulo} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 font-semibold">
                {loading ? "Recebendo..." : "Confirmar recebimento"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {concluirOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !loading && setConcluirOpen(false)}
        >
          <div
            className="bg-card rounded-2xl border border-border shadow-2xl p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="font-bold text-foreground">Concluir pedido</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Informe a data de conclusão. Por padrão é hoje; ajuste para registrar um lançamento passado.
              </p>
            </div>
            {concluirErro && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">{concluirErro}</p>}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Data de Conclusão <span className="text-red-500">*</span></label>
              <DatePicker
                value={concluirData}
                onChange={(v) => setConcluirData(v)}
                className="w-full"
              />
            </div>
            {temSaldoPendente && (
              <div className="space-y-3 rounded-xl border border-warning/30 bg-warning/10 p-3">
                <p className="text-sm font-medium text-warning">
                  Este pedido tem <span className="font-semibold">saldo a entregar</span>. Os materiais já foram retirados pelo cliente?
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={concluirRetirado === "sim" ? "default" : "outline"}
                    onClick={() => { setConcluirErro(""); setConcluirRetirado("sim"); }}
                    className={concluirRetirado === "sim" ? "bg-amber-600 hover:bg-amber-700" : ""}
                  >
                    Sim, já retirados
                  </Button>
                  <Button
                    size="sm"
                    variant={concluirRetirado === "nao" ? "default" : "outline"}
                    onClick={() => { setConcluirErro(""); setConcluirRetirado("nao"); }}
                  >
                    Não
                  </Button>
                </div>
                {concluirRetirado === "sim" && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Local de Estoque <span className="text-red-500">*</span></label>
                    <ComboboxWithCreate
                      value={concluirLocalId}
                      onChange={(v) => setConcluirLocalId(v)}
                      noneLabel="— Selecionar local —"
                      triggerClassName="h-10 rounded-lg"
                      options={balcaoLocais.map((l) => ({ value: l.id, label: l.nome }))}
                    />
                    <p className="text-[11px] text-warning">A saída do saldo pendente baixa o estoque e a conclusão fica registrada.</p>
                  </div>
                )}
                {concluirRetirado === "nao" && (
                  <p className="text-[11px] text-warning">Para concluir, registre as entregas (minutas marcadas como Entregue) antes — ou confirme a retirada acima.</p>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setConcluirOpen(false)} disabled={loading}>Cancelar</Button>
              <Button onClick={concluir} disabled={loading || !concluirData || (temSaldoPendente && concluirRetirado !== "sim")} className="font-semibold">
                {loading ? "Concluindo..." : "Concluir"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {excluirOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !loading && setExcluirOpen(false)}
        >
          <div
            className="bg-card rounded-2xl border border-border shadow-2xl p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-danger/15 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-danger" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">Excluir pedido {pedido.numero}?</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Esta ação é permanente e remove o pedido e seus itens. Não é possível
                  excluir pedidos com minutas ou contas a receber — nesse caso, cancele o pedido.
                </p>
              </div>
            </div>
            {excluirErro && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">{excluirErro}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setExcluirOpen(false)} disabled={loading}>Cancelar</Button>
              <Button onClick={excluirPedido} disabled={loading} className="bg-red-600 hover:bg-red-700 font-semibold">
                {loading ? "Excluindo..." : "Excluir definitivamente"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {blockModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setBlockModal(null)}
        >
          <div
            className="bg-card rounded-2xl border border-border shadow-2xl p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">Não é possível concluir o pedido</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{blockModal.msg}</p>
              </div>
            </div>
            {blockModal.pendentes.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="text-left px-3 py-2 font-semibold">Item</th>
                      <th className="text-right px-3 py-2 font-semibold">Falta entregar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {blockModal.pendentes.map((p) => (
                      <tr key={p.codigo}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{p.descricao}</div>
                          <div className="text-xs text-muted-foreground">{p.codigo}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-warning">
                          {fmtNum(p.pendente)} <span className="text-muted-foreground text-xs font-normal">{p.unidade}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end pt-1">
              <Button onClick={() => setBlockModal(null)} className="font-semibold">Entendi</Button>
            </div>
          </div>
        </div>
      )}
      </ModalPortal>
    </div>
  );
}
