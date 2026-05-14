export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import ClickableRow from "@/components/shared/ClickableRow";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export default async function ConferenciasPage() {
  const conferencias = await prisma.conferenciaCompra.findMany({
    include: {
      pedido: {
        select: {
          id: true,
          numero: true,
          fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
        },
      },
      _count: { select: { itens: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Count itens with divergencia
  const divergenciasCounts = await prisma.conferenciaCompraItem.groupBy({
    by: ["conferenciaId"],
    where: { divergencia: true },
    _count: true,
  });
  const divMap = Object.fromEntries(divergenciasCounts.map((d) => [d.conferenciaId, d._count]));

  return (
    <div>
      <PageHeader
        title="Conferências de Compra"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Conferências" }]}
      />
      <div className="px-8 pb-8">
        {conferencias.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg font-medium">Nenhuma conferência registrada</p>
            <p className="text-sm mt-1">Conferências são criadas automaticamente ao registrar chegada de pedidos.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Número</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Pedido</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fornecedor</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Data Conferência</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Divergências</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {conferencias.map((c) => (
                  <ClickableRow key={c.id} href={`/suprimentos/conferencias/${c.id}`}>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{c.numero}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/suprimentos/pedidos-compra/${c.pedido.id}`}
                        className="text-blue-600 hover:underline font-mono text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.pedido.numero}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.pedido.fornecedor.nomeFantasia || c.pedido.fornecedor.razaoSocial}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(c.dataConferencia)}</td>
                    <td className="px-4 py-3 text-center">
                      {divMap[c.id] ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          {divMap[c.id]}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
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
