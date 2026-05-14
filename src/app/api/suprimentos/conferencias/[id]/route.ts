export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.conferenciaCompra.findUnique({
    where: { id: params.id },
    include: {
      pedido: {
        include: {
          fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        },
      },
      itens: {
        include: {
          item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } },
          movimentacoes: { select: { id: true, tipo: true, quantidade: true, createdAt: true } },
        },
      },
    },
  });

  if (!record) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ data: record });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { itens, observacoes } = body;

  await prisma.$transaction(async (tx) => {
    if (itens && Array.isArray(itens)) {
      for (const item of itens) {
        const qtdRecebida = parseFloat(String(item.quantidadeRecebida ?? 0));

        // Get pedida to determine divergencia
        const ci = await tx.conferenciaCompraItem.findUnique({
          where: { id: item.id },
          select: { quantidadePedida: true },
        });
        const divergencia = ci
          ? Math.abs(qtdRecebida - parseFloat(String(ci.quantidadePedida))) > 0.001
          : false;

        await tx.conferenciaCompraItem.update({
          where: { id: item.id },
          data: {
            quantidadeRecebida: qtdRecebida,
            divergencia,
            ...(item.observacao !== undefined ? { observacao: item.observacao || null } : {}),
          },
        });
      }
    }

    const updateData: Record<string, unknown> = { status: "EM_CONFERENCIA" };
    if (observacoes !== undefined) updateData.observacoes = observacoes || null;

    await tx.conferenciaCompra.update({
      where: { id: params.id },
      data: updateData,
    });
  });

  const updated = await prisma.conferenciaCompra.findUnique({
    where: { id: params.id },
    include: {
      pedido: {
        include: { fornecedor: { select: { id: true, razaoSocial: true } } },
      },
      itens: {
        include: {
          item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } },
          movimentacoes: true,
        },
      },
    },
  });

  return NextResponse.json({ data: updated });
}
