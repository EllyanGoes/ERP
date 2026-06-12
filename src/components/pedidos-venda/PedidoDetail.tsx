"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatBRL, formatDate, decimalToNumber, cn, parseDecimal } from "@/lib/utils";
import { useTabTitle, useTabsContext } from "@/lib/tabs-context";
import { Plus, Truck, Pencil, Package, Trash2, AlertTriangle } from "lucide-react";
import MinutaActionsMenu from "./MinutaActionsMenu";
import PagamentosInput, {
  novaLinhaPagamento, pagamentosPayload, pagamentosValidos,
  type LinhaPagamento, type FormaOpt,
} from "./PagamentosInput";

type MinutaItemSummary = { quantidade: string };

type ItemRow = {
  id: string;
  itemId: string;
  quantidade: unknown;
  precoUnitario: unknown;
  desconto: unknown;
  valorTotal: unknown;
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
    dataEmissao: Date | string; dataEntrega: Date | string | null; dataConclusao: Date | string | null;
    condicaoPagamento: string | null; formaPagamento: string | null; observacoes: string | null;
    valorProdutos: unknown; valorDesconto: unknown; valorFrete: unknown; valorTotal: unknown;
    cliente: { id: string; razaoSocial: string };
    vendedor?: { id: string; nome: string } | null;
    pagamentos?: { id: string; forma: string; valor: unknown }[];
    itens: ItemRow[];
    contasReceber: { id: string }[];
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

const STATUS_LABEL: Record<string, string> = {
  PENDENTE:          "Pendente",
  SAIU_PARA_ENTREGA: "Saiu p/ Entrega",
  ENTREGUE:          "Entregue",
  CANCELADA:         "Cancelada",
};

const STATUS_COLOR: Record<string, string> = {
  PENDENTE:          "bg-amber-100 text-amber-700 border border-amber-200",
  SAIU_PARA_ENTREGA: "bg-blue-100 text-blue-700 border border-blue-200",
  ENTREGUE:          "bg-emerald-100 text-emerald-700 border border-emerald-200",
  CANCELADA:         "bg-gray-100 text-gray-500 border border-gray-200",
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

export default function PedidoDetail({ pedido, itensComodato, movimentacoesComodato }: PedidoDetailProps) {
  const router = useRouter();
  const { replaceCurrentTab } = useTabsContext();
  useTabTitle(pedido.numero);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"itens" | "minutas" | "comodato">("itens");
  const [blockModal, setBlockModal] = useState<{ msg: string; pendentes: ItemPendente[] } | null>(null);
  // Modal de conclusão: informa a data (default hoje; editável p/ lançamento passado).
  const [concluirOpen, setConcluirOpen] = useState(false);
  const [concluirData, setConcluirData] = useState(todayInput());

  // Venda balcão (retirada na loja): recebe o pagamento e conclui em uma ação.
  const balcaoTotal = decimalToNumber(pedido.valorTotal);
  const [balcaoOpen, setBalcaoOpen] = useState(false);
  const [balcaoLocalId, setBalcaoLocalId] = useState("");
  const [balcaoData, setBalcaoData] = useState(todayInput());
  const [balcaoErro, setBalcaoErro] = useState("");
  const [balcaoLocais, setBalcaoLocais] = useState<{ id: string; nome: string }[]>([]);
  const [balcaoFormas, setBalcaoFormas] = useState<FormaOpt[]>([]);
  const [balcaoContas, setBalcaoContas] = useState<{ id: string; nome: string; ativo?: boolean }[]>([]);
  const [balcaoPagamentos, setBalcaoPagamentos] = useState<LinhaPagamento[]>([novaLinhaPagamento()]);

  function abrirBalcao() {
    setBalcaoErro("");
    setBalcaoData(todayInput());
    setBalcaoPagamentos([novaLinhaPagamento(
      pedido.formaPagamento ?? "",
      "caixa-geral",
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
    if (!pagamentosValidos(balcaoPagamentos, balcaoFormas, balcaoTotal)) {
      setBalcaoErro("Confira as formas de pagamento — a soma precisa cobrir o total (troco só em dinheiro).");
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

  // Parcela de comodato embutida no Total persistido. Derivada do próprio total
  // para o detalhamento sempre fechar (Subtotal − Desconto + Frete + Comodato = Total),
  // inclusive em pedidos antigos cujo total ainda não incluía o comodato (→ ≈ 0).
  const comodatoNoTotal =
    decimalToNumber(pedido.valorTotal) -
    decimalToNumber(pedido.valorProdutos) +
    decimalToNumber(pedido.valorDesconto) -
    decimalToNumber(pedido.valorFrete);
  // Editing allowed up to and including scheduling. Note: saving fails at the DB
  // if items are already linked to minutas (FK Restrict), which protects deliveries.
  const canEdit =
    pedido.status === "ORCAMENTO" ||
    pedido.status === "CONFIRMADO" ||
    pedido.status === "EM_AGENDAMENTO";

  async function changeStatus(next: string, dataConclusao?: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/pedidos-venda/${pedido.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, ...(dataConclusao ? { dataConclusao } : {}) }),
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

  return (
    <div className="space-y-6">
      {/* Actions bar */}
      {(actions.length > 0 || canEdit || (pedido.status === "EM_AGENDAMENTO" && pedido.contasReceber.length === 0)) && (
        <div className="flex items-center gap-2 p-4 bg-gray-50 rounded-xl border border-gray-100">
          <span className="text-sm text-gray-500 mr-2">Ações:</span>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => replaceCurrentTab(`/pedidos-venda/${pedido.id}/editar`)} disabled={loading} className="gap-1.5">
              <Pencil className="w-3.5 h-3.5" />
              Editar
            </Button>
          )}
          {(pedido.status === "ORCAMENTO" || pedido.status === "CONFIRMADO") &&
            !pedido.intragrupo &&
            minutas.filter((m) => m.status !== "CANCELADA").length === 0 && (
            <Button size="sm" onClick={abrirBalcao} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
              <Package className="w-4 h-4 mr-1.5" />
              Venda Balcão
            </Button>
          )}
          {actions.map((a) => (
            <Button
              key={a.next}
              variant={a.variant ?? "default"}
              size="sm"
              onClick={() => {
                if (a.next === "CONCLUIDO") { setConcluirData(todayInput()); setConcluirOpen(true); }
                else changeStatus(a.next);
              }}
              disabled={loading}
            >
              {a.label}
            </Button>
          ))}
          {pedido.status === "EM_AGENDAMENTO" && pedido.contasReceber.length === 0 && (
            <Button variant="outline" size="sm" onClick={gerarContaReceber} disabled={loading}>
              Gerar Conta a Receber
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Info card */}
        <Card>
          <CardHeader><CardTitle className="text-base">Informações</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Cliente</span><span className="font-medium">{pedido.cliente.razaoSocial}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Modalidade</span>
              <span className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
                pedido.modalidade === "BALCAO" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700",
              )}>
                {pedido.modalidade === "BALCAO" ? "Balcão" : "Venda Agendada"}
              </span>
            </div>
            <div className="flex justify-between"><span className="text-gray-500">Vendedor</span><span>{pedido.vendedor?.nome || "—"}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Nº Orçamento</span><span>{pedido.numeroOrcamento || "—"}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Emissão</span><span>{formatDate(pedido.dataEmissao)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Conclusão</span><span>{pedido.dataConclusao ? formatDate(pedido.dataConclusao) : "—"}</span></div>
            {pedido.pagamentos && pedido.pagamentos.length > 0 ? (
              <div>
                <span className="text-gray-500">Forma Pagamento</span>
                <div className="mt-1 space-y-0.5">
                  {pedido.pagamentos.map((pg) => (
                    <div key={pg.id} className="flex justify-between pl-2">
                      <span className="text-gray-600">{pg.forma}</span>
                      <span className="font-medium tabular-nums">{formatBRL(decimalToNumber(pg.valor))}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex justify-between"><span className="text-gray-500">Forma Pagamento</span><span>{pedido.formaPagamento || "—"}</span></div>
            )}
            <div className="flex justify-between"><span className="text-gray-500">Cond. Pagamento</span><span>{pedido.condicaoPagamento || "—"}</span></div>
            {pedido.observacoes && <div className="pt-2 border-t"><p className="text-gray-400 text-xs mb-1">Observações</p><p>{pedido.observacoes}</p></div>}
          </CardContent>
        </Card>

        {/* Totals card */}
        <Card>
          <CardHeader><CardTitle className="text-base">Totais</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal Produtos</span><span>{formatBRL(decimalToNumber(pedido.valorProdutos))}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Desconto</span><span className="text-red-500">- {formatBRL(decimalToNumber(pedido.valorDesconto))}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Frete</span><span>{formatBRL(decimalToNumber(pedido.valorFrete))}</span></div>
            {Math.abs(comodatoNoTotal) > 0.005 && (
              <div className="flex justify-between"><span className="text-gray-500">Comodato</span><span>{formatBRL(comodatoNoTotal)}</span></div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold text-base"><span>Total</span><span>{formatBRL(decimalToNumber(pedido.valorTotal))}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Itens | Minutas | Comodato */}
      <div>
        <div className="flex items-center border-b border-gray-200 mb-0">
          <button
            onClick={() => setActiveTab("itens")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === "itens"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            Itens ({pedido.itens.length})
          </button>
          <button
            onClick={() => setActiveTab("minutas")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5",
              activeTab === "minutas"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Truck className="w-3.5 h-3.5" />
            Minutas {minutas.length > 0 && `(${minutas.length})`}
          </button>
          <button
            onClick={() => setActiveTab("comodato")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5",
              activeTab === "comodato"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
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
                  <tr className="border-b text-xs text-gray-400 uppercase">
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
                      <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 font-mono text-xs">{item.item.codigo}</td>
                        <td className="py-2.5">{item.item.descricao}</td>
                        <td className="py-2.5 text-center text-gray-400 text-xs">{item.item.unidade?.sigla ?? item.item.unidadeMedida}</td>
                        <td className="py-2.5 text-right tabular-nums">{fmtQty(item.quantidade)}</td>
                        <td className="py-2.5 text-right tabular-nums text-emerald-600">{fmtQty(entregue)}</td>
                        <td className="py-2.5 text-right tabular-nums font-semibold">
                          <span className={saldo === 0 ? "text-gray-400" : "text-gray-800"}>
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

        {/* MINUTAS TAB */}
        {activeTab === "minutas" && (
          <Card style={{ borderTopLeftRadius: 0 }}>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
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
                    <tr className="border-b text-xs text-gray-400 uppercase">
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
                        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                        onClick={() => router.push(`/comercial/minutas/${m.id}`)}
                      >
                        <td className="py-2.5 font-mono font-semibold text-blue-600 hover:underline">{m.numero}</td>
                        <td className="py-2.5 font-mono text-gray-600">{m.numeroFisico || "—"}</td>
                        <td className="py-2.5">
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold", STATUS_COLOR[m.status])}>
                            {STATUS_LABEL[m.status]}
                          </span>
                        </td>
                        <td className="py-2.5 text-gray-600">{fmtDate(m.dataEmissao)}</td>
                        <td className="py-2.5 text-gray-600">{fmtDate(m.dataEntrega)}</td>
                        <td className="py-2.5 text-gray-600">{m.motorista?.nome ?? "—"}</td>
                        <td className="py-2.5 text-gray-600">{m.localEstoque?.nome ?? "—"}</td>
                        <td className="py-2.5 text-right text-gray-600">{m.itens.length}</td>
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
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Saldo por Item</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase border-b">
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
                            <td className="py-2 text-gray-700">{pvItem.item.descricao}</td>
                            <td className="py-2 text-right tabular-nums text-gray-600">{fmtQty(total)}</td>
                            <td className="py-2 text-right tabular-nums text-blue-600">{fmtQty(minutado)}</td>
                            <td className="py-2 text-right tabular-nums text-emerald-600">{fmtQty(entregue)}</td>
                            <td className="py-2 text-right tabular-nums font-semibold">
                              <span className={saldo === 0 ? "text-gray-400" : "text-gray-800"}>{fmtQty(saldo)}</span>
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

        {/* COMODATO TAB */}
        {activeTab === "comodato" && (
          <Card style={{ borderTopLeftRadius: 0 }}>
            <CardContent className="pt-4 space-y-5">
              {/* Formulário de saída — liberado a qualquer usuário, pois fica amarrado ao pedido */}
              <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-4">
                <p className="text-sm font-medium text-gray-700">Registrar saída de comodato (cliente levando)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Item em Comodato</label>
                    <select
                      value={comodatoItemId}
                      onChange={(e) => onComodatoItemChange(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Selecione...</option>
                      {itensComodato.map((i) => (
                        <option key={i.id} value={i.id}>{i.codigo} — {i.descricao}</option>
                      ))}
                    </select>
                    {itensComodato.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        Nenhum item marcado como comodato. Marque a opção &quot;Comodato&quot; no cadastro do item.
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Qtd</label>
                      <input
                        inputMode="decimal"
                        value={comodatoQtd}
                        onChange={(e) => setComodatoQtd(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Valor un. (R$)</label>
                      <input
                        inputMode="decimal"
                        value={comodatoValor}
                        onChange={(e) => setComodatoValor(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Data</label>
                      <input
                        type="date"
                        value={comodatoData}
                        onChange={(e) => setComodatoData(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Documento (opcional)</label>
                    <input
                      type="text"
                      value={comodatoDoc}
                      onChange={(e) => setComodatoDoc(e.target.value)}
                      placeholder="Ex: nota, romaneio..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Observações (opcional)</label>
                    <input
                      type="text"
                      value={comodatoObs}
                      onChange={(e) => setComodatoObs(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                <p className="text-sm text-gray-400 text-center py-6">Nenhum comodato lançado para este pedido.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-gray-400 uppercase">
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
                      <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 text-gray-600">{fmtDate(m.data)}</td>
                        <td className="py-2.5">{m.item.codigo} — {m.item.descricao}</td>
                        <td className="py-2.5 text-right tabular-nums">{fmtNum(m.quantidade)}</td>
                        <td className="py-2.5 text-right">{formatBRL(m.valorUnitario)}</td>
                        <td className="py-2.5 text-right font-medium">{formatBRL(m.quantidade * m.valorUnitario)}</td>
                        <td className="py-2.5 text-right">
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => removerComodato(m.id)}
                            disabled={loading}
                            className="h-7 w-7 text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 font-semibold">
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

      {balcaoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !loading && setBalcaoOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="font-bold text-gray-800">Venda Balcão — receber e concluir</h3>
              <p className="text-sm text-gray-600 mt-0.5">
                Baixa o estoque agora (retirada na loja), registra o recebimento de{" "}
                <span className="font-semibold">{formatBRL(decimalToNumber(pedido.valorTotal))}</span> e conclui o pedido.
              </p>
            </div>
            {balcaoErro && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{balcaoErro}</p>}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Local de Estoque <span className="text-red-500">*</span></label>
                <select
                  value={balcaoLocalId}
                  onChange={(e) => setBalcaoLocalId(e.target.value)}
                  className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Selecionar local —</option>
                  {balcaoLocais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Data do Recebimento <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={balcaoData}
                  onChange={(e) => setBalcaoData(e.target.value)}
                  className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-gray-400">Vale para a baixa de estoque, o recebimento no caixa e a conclusão do pedido.</p>
              </div>
            </div>
            {/* Formas de pagamento (misto: PIX + dinheiro etc.) */}
            <PagamentosInput linhas={balcaoPagamentos} setLinhas={setBalcaoPagamentos} formas={balcaoFormas} contas={balcaoContas} total={balcaoTotal} />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setBalcaoOpen(false)} disabled={loading}>Cancelar</Button>
              <Button onClick={concluirBalcao} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 font-semibold">
                {loading ? "Concluindo..." : "Receber e Concluir"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {concluirOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !loading && setConcluirOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="font-bold text-gray-800">Concluir pedido</h3>
              <p className="text-sm text-gray-600 mt-0.5">
                Informe a data de conclusão. Por padrão é hoje; ajuste para registrar um lançamento passado.
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Data de Conclusão <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={concluirData}
                onChange={(e) => setConcluirData(e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setConcluirOpen(false)} disabled={loading}>Cancelar</Button>
              <Button onClick={() => changeStatus("CONCLUIDO", concluirData)} disabled={loading || !concluirData} className="font-semibold">
                {loading ? "Concluindo..." : "Concluir"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {blockModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setBlockModal(null)}
        >
          <div
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Não é possível concluir o pedido</h3>
                <p className="text-sm text-gray-600 mt-0.5">{blockModal.msg}</p>
              </div>
            </div>
            {blockModal.pendentes.length > 0 && (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-3 py-2 font-semibold">Item</th>
                      <th className="text-right px-3 py-2 font-semibold">Falta entregar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {blockModal.pendentes.map((p) => (
                      <tr key={p.codigo}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800">{p.descricao}</div>
                          <div className="text-xs text-gray-400">{p.codigo}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-amber-700">
                          {fmtNum(p.pendente)} <span className="text-gray-400 text-xs font-normal">{p.unidade}</span>
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
    </div>
  );
}
