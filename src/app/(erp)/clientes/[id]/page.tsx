import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Edit } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import ClienteDetail from "@/components/clientes/ClienteDetail";

export const dynamic = "force-dynamic";

export default async function ClienteDetailPage({ params }: { params: { id: string } }) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: params.id },
    include: {
      pedidosVenda: { orderBy: { createdAt: "desc" }, take: 20, include: { cliente: { select: { razaoSocial: true } } } },
      contasReceber: { orderBy: { dataVencimento: "asc" }, take: 20 },
    },
  });
  if (!cliente) notFound();

  return (
    <div>
      <PageHeader
        title={cliente.nomeFantasia || cliente.razaoSocial}
        breadcrumbs={[{ label: "Clientes", href: "/clientes" }, { label: cliente.razaoSocial }]}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={cliente.status} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/clientes/${cliente.id}/editar`}>
                <Edit className="w-4 h-4 mr-2" />
                Editar
              </Link>
            </Button>
          </div>
        }
      />
      <div className="px-8 pb-8">
        <ClienteDetail cliente={cliente as any} />
      </div>
    </div>
  );
}
