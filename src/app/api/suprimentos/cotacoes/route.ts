export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";

export async function GET() {
  const data = await prisma.cotacaoCompra.findMany({
    include: {
      necessidade: { select: { id: true, numero: true } },
      _count: { select: { fornecedores: true } },
      fornecedores: {
        select: {
          status: true,
          itens: { select: { precoUnitario: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  try {
  const body = await req.json();
  const { necessidadeId, nome, observacoes, infoEntrega, dataLimiteResposta, fornecedorIds = [], itens = [] } = body;

  // Build itemId -> quantidade map
  let qtdMap: Record<string, number> = {};

  if (necessidadeId && itens.length === 0) {
    // Pull quantities from the necessidade
    const nc = await prisma.necessidadeCompra.findUnique({
      where: { id: necessidadeId },
      include: { itens: true },
    });
    if (nc) {
      for (const i of nc.itens) {
        qtdMap[i.itemId] = parseFloat(String(i.quantidadeAprovada ?? i.quantidade));
      }
    }
  } else {
    for (const i of itens) {
      qtdMap[i.itemId] = parseFloat(String(i.quantidade)) || 1;
    }
  }

  const produtoIds = Object.keys(qtdMap);

  const cotacao = await prisma.$transaction(async (tx) => {
    const seq = await tx.sequencia.upsert({
      where: { prefixo: "CT" },
      create: { prefixo: "CT", ultimo: 1 },
      update: { ultimo: { increment: 1 } },
    });
    const numero = generateSimpleDocNumber("CT", seq.ultimo);

    const record = await tx.cotacaoCompra.create({
      data: {
        numero,
        nome: nome?.trim() || null,
        necessidadeId: necessidadeId || null,
        observacoes: observacoes?.trim() || null,
        infoEntrega: infoEntrega?.trim() || null,
        dataLimiteResposta: dataLimiteResposta ? new Date(dataLimiteResposta) : null,
        fornecedores: {
          create: fornecedorIds.map((fornecedorId: string) => ({
            fornecedorId,
            itens: {
              create: produtoIds.map((itemId) => ({
                itemId,
                quantidade: qtdMap[itemId] ?? 1,
              })),
            },
          })),
        },
      },
      include: {
        fornecedores: { include: { itens: true } },
      },
    });

    return record;
  });

  return NextResponse.json({ data: cotacao }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /cotacoes]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
