"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatBRL, formatDate, decimalToNumber, cn } from "@/lib/utils";
import { Plus, Truck } from "lucide-react";

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
  status: "PENDENTE" | "SAIU_PARA_ENTREGA" | "ENTREGUE" | "CANCELADA";
  dataEmissao: string;
  dataEntrega: string | null;
  motorista: string | null;
  placa: string | null;
  localEstoque: { id: string; nome: string } | null;
  itens: { id: string; pedidoVendaItemId: string; quantidade: string; quantidadeConvertida: string | null; unidade: { id: string; sigla: string } | null }[];
};

type PedidoDetailProps = {
  pedido: {
    id: string; numero: string; status: string;
    dataEmissao: Date | string; dataEntrega: Date | string | null;
    condicaoPagamento: string | null; observacoes: string | null;
    valorProdutos: unknown; valorDesconto: unknown; valorFrete: unknown; valorTotal: unknown;
    cliente: { id: string; razaoSocial: string };
    itens: ItemRow[];
    contasReceber: { id: string }[];
    minutas?: MinutaDoPedido[];
  };
};

const NEXT_STATUS: Record<string, { label: string; next: string; variant?: "default" | "destructive" | "outline" }[]> = {
  ORCAMENTO:   [{ label: "Confirmar Pedido", next: "CONFIRMADO" }, { label: "Cancelar", next: "CANCELADO", variant: "destructive" }],
  CONFIRMADO:     [{ label: "Agendar Entrega", next: "EM_AGENDAMENTO" }, { label: "Cancelar", next: "CANCELADO", variant: "destructive" }],
  EM_AGENDAMENTO: [{ label: "Registrar Entrega", next: "ENTREGUE" }, { label: "Cancelar", next: "CANCELADO", variant: "destructive" }],
  ENTREGUE:    [],
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
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function PedidoDetail({ pedido }: PedidoDetailProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"itens" | "minutas">("itens");

  const actions = NEXT_STATUS[pedido.status] ?? [];
  const minutas = pedido.minutas ?? [];

  async function changeStatus(next: string) {
    setLoading(true);
    await fetch(`/api/pedidos-venda/${pedido.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setLoading(false);
    router.refresh();
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
      {(actions.length > 0 || (pedido.status === "EM_AGENDAMENTO" && pedido.contasReceber.length === 0)) && (
        <div className="flex items-center gap-2 p-4 bg-gray-50 rounded-xl border border-gray-100">
          <span className="text-sm text-gray-500 mr-2">Ações:</span>
          {actions.map((a) => (
            <Button key={a.next} variant={a.variant ?? "default"} size="sm" onClick={() => changeStatus(a.next)} disabled={loading}>
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
            <div className="flex justify-between"><span className="text-gray-500">Emissão</span><span>{formatDate(pedido.dataEmissao)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Entrega</span><span>{pedido.dataEntrega ? formatDate(pedido.dataEntrega) : "—"}</span></div>
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
            <Separator />
            <div className="flex justify-between font-semibold text-base"><span>Total</span><span>{formatBRL(decimalToNumber(pedido.valorTotal))}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Itens | Minutas */}
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
                      <th className="text-left pb-2">Status</th>
                      <th className="text-left pb-2">Emissão</th>
                      <th className="text-left pb-2">Entrega</th>
                      <th className="text-left pb-2">Motorista</th>
                      <th className="text-left pb-2">Local</th>
                      <th className="text-right pb-2">Itens</th>
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
                        <td className="py-2.5">
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold", STATUS_COLOR[m.status])}>
                            {STATUS_LABEL[m.status]}
                          </span>
                        </td>
                        <td className="py-2.5 text-gray-600">{fmtDate(m.dataEmissao)}</td>
                        <td className="py-2.5 text-gray-600">{fmtDate(m.dataEntrega)}</td>
                        <td className="py-2.5 text-gray-600">{m.motorista ?? "—"}</td>
                        <td className="py-2.5 text-gray-600">{m.localEstoque?.nome ?? "—"}</td>
                        <td className="py-2.5 text-right text-gray-600">{m.itens.length}</td>
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
      </div>
    </div>
  );
}
