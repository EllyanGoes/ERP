export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDocNumber } from "@/lib/utils";

export async function GET() {
  const data = await prisma.necessidadeCompra.findMany({
    include: { _count: { select: { itens: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.itens || body.itens.length === 0) {
    return NextResponse.json({ error: "Adicione pelo menos um item" }, { status: 400 });
  }

  const necessidade = await prisma.$transaction(async (tx) => {
    // Get next sequence number
    const seq = await tx.sequencia.upsert({
      where: { prefixo: "NC" },
      create: { prefixo: "NC", ultimo: 1 },
      update: { ultimo: { increment: 1 } },
    });

    const numero = generateDocNumber("NC", seq.ultimo);

    const record = await tx.necessidadeCompra.create({
      data: {
        numero,
        status: "RASCUNHO",
        solicitante: body.solicitante?.trim() || null,
        justificativa: body.justificativa?.trim() || null,
        dataNecessidade: body.dataNecessidade ? new Date(body.dataNecessidade) : null,
        observacoes: body.observacoes?.trim() || null,
        itens: {
          create: body.itens.map((item: { itemId: string; quantidade: number; observacao?: string }) => ({
            itemId: item.itemId,
            quantidade: parseFloat(String(item.quantidade)),
            observacao: item.observacao?.trim() || null,
          })),
        },
      },
      include: { itens: true },
    });

    return record;
  });

  return NextResponse.json({ data: necessidade }, { status: 201 });
}
