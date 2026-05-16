export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";

export async function GET() {
  const data = await prisma.pedidoCompra.findMany({
    include: {
      fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      cotacao: { select: { id: true, numero: true } },
      _count: { select: { itens: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { fornecedorId, cotacaoId, dataEntregaPrevista, observacoes, itens = [] } = body;

  if (!fornecedorId) {
    return NextResponse.json({ error: "Fornecedor obrigatório" }, { status: 400 });
  }
  if (!itens || itens.length === 0) {
    return NextResponse.json({ error: "Adicione pelo menos um item" }, { status: 400 });
  }

  const pedido = await prisma.$transaction(async (tx) => {
    const seq = await tx.sequencia.upsert({
      where: { prefixo: "PC" },
      create: { prefixo: "PC", ultimo: 1 },
      update: { ultimo: { increment: 1 } },
    });
    const numero = generateSimpleDocNumber("PC", seq.ultimo);

    const parsedItens = itens.map((i: { itemId: string; quantidade: number; precoUnitario: number }) => ({
      itemId: i.itemId,
      quantidade: parseFloat(String(i.quantidade)),
      precoUnitario: parseFloat(String(i.precoUnitario)),
      valorTotal: parseFloat(String(i.quantidade)) * parseFloat(String(i.precoUnitario)),
    }));

    const valorTotal = parsedItens.reduce((sum: number, i: { valorTotal: number }) => sum + i.valorTotal, 0);

    const record = await tx.pedidoCompra.create({
      data: {
        numero,
        fornecedorId,
        cotacaoId: cotacaoId || null,
        valorTotal,
        dataEntregaPrevista: dataEntregaPrevista ? new Date(dataEntregaPrevista) : null,
        observacoes: observacoes?.trim() || null,
        itens: {
          create: parsedItens,
        },
      },
      include: {
        fornecedor: { select: { id: true, razaoSocial: true } },
        itens: { include: { item: { select: { id: true, codigo: true, descricao: true } } } },
      },
    });

    return record;
  });

  return NextResponse.json({ data: pedido }, { status: 201 });
}
