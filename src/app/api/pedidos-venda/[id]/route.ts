export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pedidoVendaSchema } from "@/lib/validations/pedido-venda";
import { generateDocNumber } from "@/lib/utils";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const pedido = await prisma.pedidoVenda.findUnique({
    where: { id: params.id },
    include: {
      cliente: true,
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
          itens: {
            select: {
              id: true,
              pedidoVendaItemId: true,
              itemId: true,
              quantidade: true,
              quantidadeConvertida: true,
              unidade: { select: { id: true, sigla: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  return NextResponse.json({ data: pedido });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const parsed = pedidoVendaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { itens, ...pedidoData } = parsed.data;
  const valorProdutos = itens.reduce((sum, i) => sum + i.valorTotal, 0);
  const valorTotal = valorProdutos - (pedidoData.valorDesconto ?? 0) + (pedidoData.valorFrete ?? 0);

  const pedido = await prisma.$transaction(async (tx) => {
    await tx.pedidoVendaItem.deleteMany({ where: { pedidoVendaId: params.id } });
    return tx.pedidoVenda.update({
      where: { id: params.id },
      data: {
        ...pedidoData,
        valorProdutos,
        valorTotal,
        dataEmissao: pedidoData.dataEmissao ? new Date(pedidoData.dataEmissao) : new Date(),
        dataEntrega: pedidoData.dataEntrega ? new Date(pedidoData.dataEntrega) : null,
        itens: {
          create: itens.map((item) => ({
            itemId: item.itemId,
            quantidade: item.quantidade,
            precoUnitario: item.precoUnitario,
            desconto: item.desconto ?? 0,
            valorTotal: item.valorTotal,
          })),
        },
      },
      include: { cliente: true, itens: { include: { item: true } } },
    });
  });

  return NextResponse.json({ data: pedido });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.pedidoVenda.update({ where: { id: params.id }, data: { status: "CANCELADO" } });
  return NextResponse.json({ data: { ok: true } });
}
