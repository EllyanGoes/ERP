import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import PedidoDetail from "@/components/pedidos-venda/PedidoDetail";

export const dynamic = "force-dynamic";

export default async function PedidoDetailPage({ params }: { params: { id: string } }) {
  const pedido = await prisma.pedidoVenda.findUnique({
    where: { id: params.id },
    include: {
      cliente: true,
      itens: { include: { item: true } },
      contasReceber: true,
    },
  });
  if (!pedido) notFound();

  return (
    <div>
      <PageHeader
        title={pedido.numero}
        breadcrumbs={[{ label: "Pedidos de Venda", href: "/pedidos-venda" }, { label: pedido.numero }]}
        action={<StatusBadge status={pedido.status} />}
      />
      <div className="px-8 pb-8">
        <PedidoDetail pedido={pedido as any} />
      </div>
    </div>
  );
}
