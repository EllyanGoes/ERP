export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";
import ClickableRow from "@/components/shared/ClickableRow";
import Link from "next/link";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default async function NecessidadesPage() {
  const necessidades = await prisma.necessidadeCompra.findMany({
    include: {
      _count: { select: { itens: true } },
      cotacoes: {
        select: { id: true, numero: true, status: true },
        orderBy: { createdAt: "asc" },
      },
      pedidosCompra: {
        select: {
          id: true,
          numero: true,
          status: true,
          conferencia: { select: { id: true, numero: true, status: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Necessidades de Compra"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Necessidades" }]}
        action={
          <Button asChild>
            <Link href="/suprimentos/necessidades/nova">
              <Plus className="w-4 h-4 mr-2" />
              Nova Necessidade
            </Link>
          </Button>
        }
      />
      <div className="px-8 pb-8">
        {necessidades.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg font-medium">Nenhuma necessidade registrada</p>
            <p className="text-sm mt-1">Clique em &quot;Nova Necessidade&quot; para começar.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Número</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Solicitante</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Data Necessidade</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Itens</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Cotação</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Pedidos de Compra</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Doc. de Entrada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {necessidades.map((n) => {
                  // Collect all conferências from pedidos
                  const conferencias = n.pedidosCompra
                    .map((p) => p.conferencia)
                    .filter((c): c is NonNullable<typeof c> => c !== null);

                  return (
                    <ClickableRow key={n.id} href={`/suprimentos/necessidades/${n.id}`}>
                      <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{n.numero}</td>
                      <td className="px-4 py-3 text-gray-700">{n.solicitante || "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={n.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(n.dataNecessidade)}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{n._count.itens}</td>

                      {/* Cotações */}
                      <td className="px-4 py-3">
                        {n.cotacoes.length === 0 ? (
                          <span className="text-gray-400 text-xs">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {n.cotacoes.map((c) => (
                              <Link
                                key={c.id}
                                href={`/suprimentos/cotacoes/${c.id}`}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-gray-100 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 transition-colors group"
                              >
                                <span className="font-mono text-xs font-medium text-gray-700 group-hover:text-blue-700">
                                  {c.numero}
                                </span>
                                <StatusBadge status={c.status} />
                              </Link>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Pedidos de Compra */}
                      <td className="px-4 py-3">
                        {n.pedidosCompra.length === 0 ? (
                          <span className="text-gray-400 text-xs">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {n.pedidosCompra.map((p) => (
                              <Link
                                key={p.id}
                                href={`/suprimentos/pedidos-compra/${p.id}`}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-gray-100 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 transition-colors group"
                              >
                                <span className="font-mono text-xs font-medium text-gray-700 group-hover:text-blue-700">
                                  {p.numero}
                                </span>
                                <StatusBadge status={p.status} />
                              </Link>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Documentos de Entrada */}
                      <td className="px-4 py-3">
                        {conferencias.length === 0 ? (
                          <span className="text-gray-400 text-xs">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {conferencias.map((c) => (
                              <Link
                                key={c.id}
                                href={`/suprimentos/conferencias/${c.id}`}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-gray-100 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 transition-colors group"
                              >
                                <span className="font-mono text-xs font-medium text-gray-700 group-hover:text-blue-700">
                                  {c.numero}
                                </span>
                                <StatusBadge status={c.status} />
                              </Link>
                            ))}
                          </div>
                        )}
                      </td>
                    </ClickableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
