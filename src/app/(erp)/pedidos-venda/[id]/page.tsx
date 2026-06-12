import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import PedidoDetail from "@/components/pedidos-venda/PedidoDetail";
import { decimalToNumber } from "@/lib/utils";
import ImprimirPedidoButton from "@/components/pedidos-venda/ImprimirPedidoButton";
import type { PedidoPrintData } from "@/lib/print-pedido";
import { pedidoPrintData } from "@/lib/print-pedido-server";

export const dynamic = "force-dynamic";

export default async function PedidoDetailPage({ params }: { params: { id: string } }) {
  const [pedido, itensComodatoRaw, movimentacoesRaw] = await Promise.all([
    prisma.pedidoVenda.findUnique({
      where: { id: params.id },
      include: {
        cliente: true,
        empresa: true,
        vendedor: { select: { id: true, nome: true } },
        itens: {
          include: {
            item: {
              include: {
                unidade: { select: { id: true, sigla: true, nome: true } },
                itemUnidades: {
                  where: { isPrincipal: false },
                  select: { id: true, fatorConversao: true, unidade: { select: { id: true, sigla: true, nome: true } } },
                },
              },
            },
            minutaItens: {
              where: { minuta: { status: { not: "CANCELADA" } } },
              select: { quantidade: true },
            },
          },
        },
        contasReceber: true,
        minutas: {
          include: {
            localEstoque: { select: { id: true, nome: true } },
            motorista:    { select: { id: true, nome: true } },
            itens: {
              select: {
                id: true, pedidoVendaItemId: true, itemId: true,
                quantidade: true, quantidadeConvertida: true,
                unidade: { select: { id: true, sigla: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
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
      orderBy: { data: "desc" },
      include: { item: { select: { id: true, codigo: true, descricao: true } } },
    }),
  ]);
  if (!pedido) notFound();

  const itensComodato = itensComodatoRaw.map((i) => ({
    id: i.id,
    codigo: i.codigo,
    descricao: i.descricao,
    precoVenda: decimalToNumber(i.precoVenda),
  }));

  const movimentacoesComodato = movimentacoesRaw.map((m) => ({
    id: m.id,
    itemId: m.itemId,
    tipo: m.tipo as "SAIDA" | "RETORNO",
    quantidade: decimalToNumber(m.quantidade),
    valorUnitario: decimalToNumber(m.valorUnitario),
    data: m.data.toISOString(),
    documento: m.documento,
    observacoes: m.observacoes,
    item: m.item,
  }));

  const pedidoPrint: PedidoPrintData = pedidoPrintData(pedido);

  return (
    <div>
      <PageHeader
        title={pedido.numero}
        breadcrumbs={[{ label: "Pedidos de Venda", href: "/pedidos-venda" }, { label: pedido.numero }]}
        action={
          <div className="flex items-center gap-2">
            <ImprimirPedidoButton pedido={pedidoPrint} />
            <StatusBadge status={pedido.status} />
          </div>
        }
      />
      <div className="px-8 pb-8">
        {/* objeto Prisma completo; o componente tipa só o que consome */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <PedidoDetail pedido={pedido as any} itensComodato={itensComodato} movimentacoesComodato={movimentacoesComodato} />
      </div>
    </div>
  );
}
