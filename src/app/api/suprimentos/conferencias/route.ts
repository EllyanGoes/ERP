export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDocNumber } from "@/lib/utils";

export async function GET() {
  const data = await prisma.conferenciaCompra.findMany({
    include: {
      pedido: {
        select: {
          id: true,
          numero: true,
          fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { pedidoId, observacoes } = body;

  if (!pedidoId) {
    return NextResponse.json({ error: "pedidoId obrigatório" }, { status: 400 });
  }

  // Check if conferencia already exists for this pedido
  const existing = await prisma.conferenciaCompra.findUnique({
    where: { pedidoId },
  });
  if (existing) {
    return NextResponse.json({ data: existing });
  }

  const pedido = await prisma.pedidoCompra.findUnique({
    where: { id: pedidoId },
    include: { itens: true },
  });

  if (!pedido) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  const conferencia = await prisma.$transaction(async (tx) => {
    const seq = await tx.sequencia.upsert({
      where: { prefixo: "CF" },
      create: { prefixo: "CF", ultimo: 1 },
      update: { ultimo: { increment: 1 } },
    });
    const numero = generateDocNumber("CF", seq.ultimo);

    const record = await tx.conferenciaCompra.create({
      data: {
        numero,
        pedidoId,
        observacoes: observacoes?.trim() || null,
        itens: {
          create: pedido.itens.map((i) => ({
            itemId: i.itemId,
            quantidadePedida: parseFloat(String(i.quantidade)),
            quantidadeRecebida: 0,
          })),
        },
      },
      include: {
        itens: { include: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } } } },
      },
    });

    // Update pedido to EM_TRANSITO
    await tx.pedidoCompra.update({
      where: { id: pedidoId },
      data: { status: "EM_TRANSITO" },
    });

    return record;
  });

  return NextResponse.json({ data: conferencia }, { status: 201 });
}
