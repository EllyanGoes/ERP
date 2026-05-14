"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatBRL, formatDate, decimalToNumber } from "@/lib/utils";

type ItemRow = {
  id: string;
  quantidade: unknown;
  precoUnitario: unknown;
  desconto: unknown;
  valorTotal: unknown;
  item: { codigo: string; descricao: string; unidadeMedida: string };
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
  };
};

const NEXT_STATUS: Record<string, { label: string; next: string; variant?: "default" | "destructive" | "outline" }[]> = {
  ORCAMENTO: [{ label: "Confirmar Pedido", next: "CONFIRMADO" }, { label: "Cancelar", next: "CANCELADO", variant: "destructive" }],
  CONFIRMADO: [{ label: "Iniciar Produção", next: "EM_PRODUCAO" }, { label: "Cancelar", next: "CANCELADO", variant: "destructive" }],
  EM_PRODUCAO: [{ label: "Faturar", next: "FATURADO" }, { label: "Cancelar", next: "CANCELADO", variant: "destructive" }],
  FATURADO: [{ label: "Registrar Entrega", next: "ENTREGUE" }, { label: "Cancelar", next: "CANCELADO", variant: "destructive" }],
  ENTREGUE: [],
  CANCELADO: [],
};

export default function PedidoDetail({ pedido }: PedidoDetailProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const actions = NEXT_STATUS[pedido.status] ?? [];

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

  return (
    <div className="space-y-6">
      {/* Actions bar */}
      {(actions.length > 0 || (pedido.status === "FATURADO" && pedido.contasReceber.length === 0)) && (
        <div className="flex items-center gap-2 p-4 bg-gray-50 rounded-xl border border-gray-100">
          <span className="text-sm text-gray-500 mr-2">Ações:</span>
          {actions.map((a) => (
            <Button key={a.next} variant={a.variant ?? "default"} size="sm" onClick={() => changeStatus(a.next)} disabled={loading}>
              {a.label}
            </Button>
          ))}
          {pedido.status === "FATURADO" && pedido.contasReceber.length === 0 && (
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

      {/* Items table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Itens ({pedido.itens.length})</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-400 uppercase">
                <th className="text-left pb-2">Código</th>
                <th className="text-left pb-2">Descrição</th>
                <th className="text-center pb-2">Un.</th>
                <th className="text-right pb-2">Qtd</th>
                <th className="text-right pb-2">Preço Unit.</th>
                <th className="text-right pb-2">Desconto</th>
                <th className="text-right pb-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {pedido.itens.map((item) => (
                <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2.5 font-mono text-xs">{item.item.codigo}</td>
                  <td className="py-2.5">{item.item.descricao}</td>
                  <td className="py-2.5 text-center text-gray-400 text-xs">{item.item.unidadeMedida}</td>
                  <td className="py-2.5 text-right">{decimalToNumber(item.quantidade)}</td>
                  <td className="py-2.5 text-right">{formatBRL(decimalToNumber(item.precoUnitario))}</td>
                  <td className="py-2.5 text-right text-red-400">{formatBRL(decimalToNumber(item.desconto))}</td>
                  <td className="py-2.5 text-right font-medium">{formatBRL(decimalToNumber(item.valorTotal))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
