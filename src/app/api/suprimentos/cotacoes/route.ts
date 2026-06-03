export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") || "").trim();
  const formalizaveis =
    searchParams.get("formalizaveis") === "1" || searchParams.get("formalizaveis") === "true";

  // ── Modo busca / formalizar ────────────────────────────────────────────────
  // Cotações ainda abertas (não CONCLUÍDAS) que já têm ao menos uma proposta
  // RESPONDIDA — ou seja, prontas para formalização. Usado no popup do "Novo
  // Pedido de Compra" para vincular a uma Cotação e seguir para a Formalização.
  // Diferente da listagem, devolve só as propostas RESPONDIDAS (nome + contagem)
  // e limita os resultados.
  if (search || formalizaveis) {
    const where: Prisma.CotacaoCompraWhereInput = {
      status: { not: "CONCLUIDA" },
      fornecedores: { some: { status: "RESPONDIDA" } },
    };
    if (search) {
      where.OR = [
        { numero: { contains: search, mode: "insensitive" } },
        { nome: { contains: search, mode: "insensitive" } },
        { necessidade: { numero: { contains: search, mode: "insensitive" } } },
        { fornecedores: { some: { fornecedor: { razaoSocial: { contains: search, mode: "insensitive" } } } } },
        { fornecedores: { some: { fornecedor: { nomeFantasia: { contains: search, mode: "insensitive" } } } } },
      ];
    }
    const data = await prisma.cotacaoCompra.findMany({
      where,
      select: {
        id: true,
        numero: true,
        nome: true,
        status: true,
        necessidade: { select: { id: true, numero: true } },
        _count: { select: { fornecedores: true } },
        fornecedores: {
          where: { status: "RESPONDIDA" },
          select: {
            fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: search ? 10 : 20,
    });
    return NextResponse.json({ data });
  }

  // ── Listagem completa (tela de Cotações) ───────────────────────────────────
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

  // ── Impedir mais de uma cotação para a mesma SC ──────────────────────────
  if (necessidadeId) {
    const existingCT = await prisma.cotacaoCompra.findFirst({
      where: { necessidadeId },
      select: { numero: true },
    });
    if (existingCT) {
      return NextResponse.json(
        { error: `Já existe a Cotação ${existingCT.numero} para esta Solicitação. Não é possível criar mais de uma cotação por solicitação.` },
        { status: 409 }
      );
    }
  }

  // Build itemId -> quantidade map
  const qtdMap: Record<string, number> = {};

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

    // Update necessidade status → EM_COTACAO
    if (necessidadeId) {
      await tx.necessidadeCompra.updateMany({
        where: {
          id: necessidadeId,
          status: { in: ["APROVADA"] },
        },
        data: { status: "EM_COTACAO" },
      });
    }

    return record;
  });

  return NextResponse.json({ data: cotacao }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /cotacoes]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
