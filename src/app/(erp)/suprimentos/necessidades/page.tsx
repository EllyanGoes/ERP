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
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium">Nenhuma necessidade registrada</p>
            <p className="text-sm mt-1">Clique em &quot;Nova Necessidade&quot; para começar.</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Número</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Solicitante</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data Necessidade</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Itens</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cotação</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pedidos de Compra</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Doc. de Entrada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {necessidades.map((n) => {
                  // Collect all conferências from pedidos
                  const conferencias = n.pedidosCompra
                    .map((p) => p.conferencia)
                    .filter((c): c is NonNullable<typeof c> => c !== null);

                  return (
                    <ClickableRow key={n.id} href={`/suprimentos/necessidades/${n.id}`}>
                      <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{n.numero}</td>
                      <td className="px-4 py-3 text-foreground">{n.solicitante || "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={n.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(n.dataNecessidade)}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{n._count.itens}</td>

                      {/* Cotações */}
                      <td className="px-4 py-3">
                        {n.cotacoes.length === 0 ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {n.cotacoes.map((c) => (
                              <Link
                                key={c.id}
                                href={`/suprimentos/cotacoes/${c.id}`}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted hover:bg-info/10 border border-border hover:border-info/30 transition-colors group"
                              >
                                <span className="font-mono text-xs font-medium text-foreground group-hover:text-info">
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
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {n.pedidosCompra.map((p) => (
                              <Link
                                key={p.id}
                                href={`/suprimentos/pedidos-compra/${p.id}`}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted hover:bg-info/10 border border-border hover:border-info/30 transition-colors group"
                              >
                                <span className="font-mono text-xs font-medium text-foreground group-hover:text-info">
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
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {conferencias.map((c) => (
                              <Link
                                key={c.id}
                                href={`/suprimentos/conferencias/${c.id}`}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted hover:bg-info/10 border border-border hover:border-info/30 transition-colors group"
                              >
                                <span className="font-mono text-xs font-medium text-foreground group-hover:text-info">
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
