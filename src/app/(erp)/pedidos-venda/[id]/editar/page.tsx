import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import PedidoForm from "@/components/pedidos-venda/PedidoForm";
import { decimalToNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EditarPedidoPage({ params }: { params: { id: string } }) {
  const [pedido, clientes, itens, itensComodatoRaw, movimentacoesComodato] = await Promise.all([
    prisma.pedidoVenda.findUnique({
      where: { id: params.id },
      include: {
        pagamentos: { orderBy: { ordem: "asc" } },
        contasReceber: { select: { id: true, dataPagamento: true }, orderBy: { createdAt: "asc" } },
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
    prisma.cliente.findMany({ where: { status: "ATIVO" }, orderBy: { razaoSocial: "asc" }, select: { id: true, razaoSocial: true, nomeFantasia: true, cpfCnpj: true } }),
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
    prisma.item.findMany({
      where: { comodato: true, ativo: true },
      orderBy: { descricao: "asc" },
      select: { id: true, codigo: true, descricao: true, precoVenda: true },
    }),
    prisma.movimentacaoComodato.findMany({
      where: { pedidoVendaId: params.id },
      orderBy: { data: "asc" },
      select: { id: true, itemId: true, quantidade: true, valorUnitario: true, documento: true },
    }),
  ]);

  if (!pedido) notFound();

  const itensComodato = itensComodatoRaw.map((i) => ({
    id: i.id,
    codigo: i.codigo,
    descricao: i.descricao,
    precoVenda: decimalToNumber(i.precoVenda),
  }));

  const comodatoInicial = movimentacoesComodato.map((m) => ({
    id: m.id,
    itemId: m.itemId,
    quantidade: decimalToNumber(m.quantidade),
    valorUnitario: decimalToNumber(m.valorUnitario),
    documento: m.documento,
  }));

  const pedidoInicial = {
    id: pedido.id,
    numero: pedido.numero,
    numeroOrcamento: pedido.numeroOrcamento,
    clienteId: pedido.clienteId,
    tabelaPrecoId: pedido.tabelaPrecoId,
    vendedorId: pedido.vendedorId,
    dataEmissao: pedido.dataEmissao.toISOString(),
    dataEntrega: pedido.dataEntrega ? pedido.dataEntrega.toISOString() : null,
    condicaoPagamento: pedido.condicaoPagamento,
    naturezaFinanceiraId: pedido.naturezaFinanceiraId,
    formaPagamento: pedido.formaPagamento,
    pagamentos: pedido.pagamentos.map((p) => ({ forma: p.forma, valor: p.valor, contaBancariaId: p.contaBancariaId })),
    // Pedido já pago → a conta de destino e a data do recebimento ficam editáveis.
    pago: pedido.contasReceber.length > 0,
    pagamentoData: pedido.contasReceber[0]?.dataPagamento
      ? pedido.contasReceber[0].dataPagamento.toISOString().slice(0, 10)
      : null,
    valorFrete: pedido.valorFrete,
    observacoes: pedido.observacoes,
    estoqueOrigemEmpresaId: pedido.estoqueOrigemEmpresaId,
    precoTransferencia: pedido.precoTransferencia,
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
      precoTransferencia: pi.precoTransferencia,
      estoqueOrigemEmpresaId: pi.estoqueOrigemEmpresaId,
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
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <PedidoForm clientes={clientes as any} itens={itens as any} pedido={pedidoInicial as any} itensComodato={itensComodato} comodatoInicial={comodatoInicial} />
      </div>
    </div>
  );
}
