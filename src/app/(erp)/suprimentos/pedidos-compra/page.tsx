export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import ClickableRow from "@/components/shared/ClickableRow";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { formatBRL, formatDate, decimalToNumber } from "@/lib/utils";
import PedidoActionsMenu from "./PedidoActionsMenu";

export default async function PedidosCompraPage() {
  const pedidos = await prisma.pedidoCompra.findMany({
    include: {
      fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Pedidos de Compra"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Pedidos de Compra" }]}
        action={
          <Button asChild>
            <Link href="/suprimentos/pedidos-compra/novo">
              <Plus className="w-4 h-4 mr-2" />
              Novo Pedido Manual
            </Link>
          </Button>
        }
      />
      <div className="px-8 pb-8">
        {pedidos.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg font-medium">Nenhum pedido de compra registrado</p>
            <p className="text-sm mt-1">Pedidos são gerados a partir de cotações aprovadas.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Número</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fornecedor</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Valor Total</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Entrega Prevista</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pedidos.map((p) => (
                  <ClickableRow key={p.id} href={`/suprimentos/pedidos-compra/${p.id}`}>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{p.numero}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {p.valorTotal !== null ? formatBRL(decimalToNumber(p.valorTotal)) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(p.dataEntregaPrevista)}</td>
                    <td className="px-4 py-3 text-right">
                      <PedidoActionsMenu id={p.id} numero={p.numero} status={p.status} />
                    </td>
                  </ClickableRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
