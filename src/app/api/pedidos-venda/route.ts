export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pedidoVendaSchema } from "@/lib/validations/pedido-venda";
import { generateSimpleDocNumber } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || undefined;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  const where: any = {
    AND: [
      q ? {
        OR: [
          { numero: { contains: q, mode: "insensitive" } },
          { cliente: { razaoSocial: { contains: q, mode: "insensitive" } } },
        ],
      } : {},
      status ? { status } : {},
    ],
  };

  const [data, total] = await Promise.all([
    prisma.pedidoVenda.findMany({
      where,
      include: {
        cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        _count: { select: { minutas: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.pedidoVenda.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, limit });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = pedidoVendaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { itens, ...pedidoData } = parsed.data;

  const pedido = await prisma.$transaction(async (tx) => {
    // Generate sequence number
    const seq = await tx.sequencia.upsert({
      where: { prefixo: "PV" },
      update: { ultimo: { increment: 1 } },
      create: { prefixo: "PV", ultimo: 1 },
    });
    const numero = generateSimpleDocNumber("PV", seq.ultimo);

    // Calculate totals
    const valorProdutos = itens.reduce((sum, i) => sum + i.valorTotal, 0);
    const valorTotal = valorProdutos - (pedidoData.valorDesconto ?? 0) + (pedidoData.valorFrete ?? 0);

    return tx.pedidoVenda.create({
      data: {
        ...pedidoData,
        numero,
        valorProdutos,
        valorTotal,
        dataEmissao: pedidoData.dataEmissao ? new Date(pedidoData.dataEmissao) : new Date(),
        dataEntrega: pedidoData.dataEntrega ? new Date(pedidoData.dataEntrega) : null,
        itens: {
          create: itens.map((item) => ({
            itemId:        item.itemId,
            quantidade:    item.quantidade,
            precoUnitario: item.precoUnitario,
            descontoPct:   item.descontoPct   ?? 0,
            valorDesconto: item.valorDesconto ?? 0,
            desconto:      item.desconto      ?? 0,
            valorTotal:    item.valorTotal,
          })),
        },
      },
      include: { cliente: true, itens: { include: { item: true } } },
    });
  });

  return NextResponse.json({ data: pedido }, { status: 201 });
}
