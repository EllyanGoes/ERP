import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import PedidosTable from "@/components/pedidos-venda/PedidosTable";

export const dynamic = "force-dynamic";

export default async function PedidosVendaPage() {
  const pedidos = await prisma.pedidoVenda.findMany({
    include: { cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Pedidos de Venda"
        breadcrumbs={[{ label: "Comercial" }, { label: "Pedidos de Venda" }]}
        action={
          <Button asChild>
            <Link href="/pedidos-venda/novo">
              <Plus className="w-4 h-4 mr-2" />
              Novo Pedido
            </Link>
          </Button>
        }
      />
      <div className="px-8 pb-8">
        <PedidosTable pedidos={pedidos as any} />
      </div>
    </div>
  );
}
