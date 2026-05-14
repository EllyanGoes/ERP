export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";
import ClickableRow from "@/components/shared/ClickableRow";
import Link from "next/link";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default async function CotacoesPage() {
  const cotacoes = await prisma.cotacaoCompra.findMany({
    include: {
      necessidade: { select: { numero: true } },
      _count: { select: { fornecedores: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Cotações de Compra"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Cotações" }]}
        action={
          <Button asChild>
            <Link href="/suprimentos/cotacoes/nova">
              <Plus className="w-4 h-4 mr-2" />
              Nova Cotação
            </Link>
          </Button>
        }
      />
      <div className="px-8 pb-8">
        {cotacoes.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg font-medium">Nenhuma cotação registrada</p>
            <p className="text-sm mt-1">Clique em &quot;Nova Cotação&quot; para começar.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Número</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Necessidade</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Prazo Resposta</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Fornecedores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cotacoes.map((c) => (
                  <ClickableRow key={c.id} href={`/suprimentos/cotacoes/${c.id}`}>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{c.numero}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.necessidade?.numero ? (
                        <Link
                          href={`/compras/necessidades/${c.necessidadeId}`}
                          className="text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.necessidade.numero}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(c.dataLimiteResposta)}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{c._count.fornecedores}</td>
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
