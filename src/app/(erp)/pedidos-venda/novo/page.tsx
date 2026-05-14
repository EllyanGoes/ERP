import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import PedidoForm from "@/components/pedidos-venda/PedidoForm";

export const dynamic = "force-dynamic";

export default async function NovoPedidoPage() {
  const [clientes, itens] = await Promise.all([
    prisma.cliente.findMany({ where: { status: "ATIVO" }, orderBy: { razaoSocial: "asc" }, select: { id: true, razaoSocial: true, nomeFantasia: true } }),
    prisma.item.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true, precoVenda: true, unidadeMedida: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Novo Pedido de Venda"
        breadcrumbs={[{ label: "Pedidos de Venda", href: "/pedidos-venda" }, { label: "Novo" }]}
      />
      <div className="px-8 pb-8 max-w-5xl">
        <PedidoForm clientes={clientes as any} itens={itens as any} />
      </div>
    </div>
  );
}
