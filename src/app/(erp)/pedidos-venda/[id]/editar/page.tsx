import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import PedidoForm from "@/components/pedidos-venda/PedidoForm";

export const dynamic = "force-dynamic";

export default async function EditarPedidoPage({ params }: { params: { id: string } }) {
  const [pedido, clientes, itens] = await Promise.all([
    prisma.pedidoVenda.findUnique({
      where: { id: params.id },
      include: {
        itens: {
          include: {
            item: {
              select: {
                id: true, codigo: true, descricao: true, unidadeMedida: true,
                unidade: { select: { id: true, sigla: true, nome: true } },
                itemUnidades: {
                  select: {
                    unidadeId: true, fatorConversao: true,
                    unidade: { select: { id: true, sigla: true, nome: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.cliente.findMany({ where: { status: "ATIVO" }, orderBy: { razaoSocial: "asc" }, select: { id: true, razaoSocial: true, nomeFantasia: true } }),
    prisma.item.findMany({
      where: { ativo: true, vendavel: true },
      orderBy: { codigo: "asc" },
      select: {
        id: true, codigo: true, descricao: true, precoVenda: true, unidadeMedida: true,
        unidade: { select: { id: true, sigla: true } },
        itemUnidades: {
          select: {
            unidadeId: true, fatorConversao: true,
            unidade: { select: { id: true, sigla: true, nome: true } },
          },
        },
      },
    }),
  ]);

  if (!pedido) notFound();

  const pedidoInicial = {
    id: pedido.id,
    clienteId: pedido.clienteId,
    tabelaPrecoId: pedido.tabelaPrecoId,
    dataEmissao: pedido.dataEmissao.toISOString(),
    dataEntrega: pedido.dataEntrega ? pedido.dataEntrega.toISOString() : null,
    condicaoPagamento: pedido.condicaoPagamento,
    valorFrete: pedido.valorFrete,
    observacoes: pedido.observacoes,
    itens: pedido.itens.map((pi) => ({
      itemId: pi.itemId,
      codigo: pi.item.codigo,
      descricao: pi.item.descricao,
      unidadeSigla: pi.item.unidade?.sigla ?? pi.item.unidadeMedida,
      unidadeBaseId: pi.item.unidade?.id ?? "",
      itemUnidades: pi.item.itemUnidades.map((iu) => ({
        unidadeId: iu.unidadeId,
        fatorConversao: iu.fatorConversao,
        unidade: iu.unidade,
      })),
      quantidade: pi.quantidade,
      precoUnitario: pi.precoUnitario,
      desconto: pi.valorDesconto,
      valorTotal: pi.valorTotal,
    })),
  };

  return (
    <div>
      <PageHeader
        title={`Editar ${pedido.numero}`}
        breadcrumbs={[
          { label: "Pedidos de Venda", href: "/pedidos-venda" },
          { label: pedido.numero, href: `/pedidos-venda/${pedido.id}` },
          { label: "Editar" },
        ]}
      />
      <div className="px-8 pb-8">
        <PedidoForm clientes={clientes as any} itens={itens as any} pedido={pedidoInicial as any} />
      </div>
    </div>
  );
}
