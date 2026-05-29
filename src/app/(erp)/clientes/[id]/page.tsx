import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import ClienteDetail from "@/components/clientes/ClienteDetail";
import EditarTabButton from "@/components/shared/EditarTabButton";

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
            <EditarTabButton href={`/clientes/${cliente.id}/editar`} />
          </div>
        }
      />
      <div className="px-8 pb-8">
        <ClienteDetail cliente={cliente as any} />
      </div>
    </div>
  );
}
