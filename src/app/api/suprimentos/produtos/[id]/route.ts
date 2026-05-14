export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const item = await prisma.item.findUnique({
    where: { id: params.id },
    include: {
      tipoProduto: true,
      unidade: true,
      estoqueItems: {
        include: { localEstoque: true },
      },
      fornecedores: {
        include: { fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } } },
      },
      movimentacoes: {
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true, tipo: true, quantidade: true,
          saldoAntes: true, saldoDepois: true,
          documento: true, observacoes: true, createdAt: true,
          pedidoVendaItemId: true, conferenciaItemId: true, loteId: true,
          unidade: { select: { id: true, sigla: true, nome: true } },
        },
      },
    },
  });

  if (!item) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ data: item });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  const updateData: Record<string, unknown> = {};
  // codigo is auto-generated and immutable — never updated via PATCH
  if (body.descricao !== undefined) updateData.descricao = body.descricao;
  if (body.tipo !== undefined) updateData.tipo = body.tipo;
  if (body.unidadeId !== undefined) updateData.unidadeId = body.unidadeId || null;
  if (body.tipoProdutoId !== undefined) updateData.tipoProdutoId = body.tipoProdutoId || null;
  if (body.ncm !== undefined) updateData.ncm = body.ncm || null;
  if (body.precoVenda !== undefined) updateData.precoVenda = parseFloat(body.precoVenda) || 0;
  // precoCusto is auto-maintained by CMPM (entrada movements) — never updated via PATCH
  if (body.ativo !== undefined) updateData.ativo = body.ativo;
  if (body.observacoes !== undefined) updateData.observacoes = body.observacoes || null;

  const item = await prisma.item.update({
    where: { id: params.id },
    data: updateData,
    include: {
      tipoProduto: true,
      unidade: true,
      estoqueItems: { include: { localEstoque: true } },
      fornecedores: {
        include: { fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } } },
      },
    },
  });

  return NextResponse.json({ data: item });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const item = await prisma.item.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: {
            pedidoItens: true,
            necessidadeItens: true,
            cotacaoFornecedorItens: true,
            pedidoCompraItens: true,
            conferenciaItens: true,
          },
        },
      },
    });

    if (!item) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

    const total =
      item._count.pedidoItens +
      item._count.necessidadeItens +
      item._count.cotacaoFornecedorItens +
      item._count.pedidoCompraItens +
      item._count.conferenciaItens;

    if (total > 0) {
      return NextResponse.json(
        { error: `Não é possível excluir: produto vinculado a ${total} registro(s).` },
        { status: 409 }
      );
    }

    await prisma.$transaction([
      prisma.movimentacaoEstoque.deleteMany({ where: { itemId: params.id } }),
      prisma.estoqueItem.deleteMany({ where: { itemId: params.id } }),
      prisma.produtoFornecedor.deleteMany({ where: { itemId: params.id } }),
      prisma.item.delete({ where: { id: params.id } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
