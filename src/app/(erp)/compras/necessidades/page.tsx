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
    include: { _count: { select: { itens: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Solicitações de Compras"
        breadcrumbs={[{ label: "Compras" }, { label: "Solicitações" }]}
        action={
          <Button asChild>
            <Link href="/compras/necessidades/nova">
              <Plus className="w-4 h-4 mr-2" />
              Nova Solicitação
            </Link>
          </Button>
        }
      />
      <div className="px-8 pb-8">
        {necessidades.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg font-medium">Nenhuma solicitação registrada</p>
            <p className="text-sm mt-1">Clique em &quot;Nova Solicitação&quot; para começar.</p>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {necessidades.map((n) => (
                  <ClickableRow key={n.id} href={`/compras/necessidades/${n.id}`}>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{n.numero}</td>
                    <td className="px-4 py-3 text-gray-700">{n.solicitante || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={n.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(n.dataNecessidade)}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{n._count.itens}</td>
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
