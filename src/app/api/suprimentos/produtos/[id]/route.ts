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
        include: {
          localEstoque: {
            include: { filial: { select: { id: true, razaoSocial: true, nomeFantasia: true } } },
          },
        },
      },
      produtosFornecedor: {
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
          localEstoqueId: true, valorUnitario: true,
          lote: { select: { dataMovimentacao: true } },
          localEstoque: { select: { id: true, nome: true, filial: { select: { id: true, razaoSocial: true } } } },
          unidade: { select: { id: true, sigla: true, nome: true } },
        },
      },
    },
  });

  if (!item) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  // Resolve o número FÍSICO da minuta para as saídas geradas por minuta.
  // A movimentação grava em `documento` o número de sistema da minuta
  // (ex.: "MIN-0103"); aqui cruzamos com Minuta.numero para anexar numeroFisico.
  const numerosMinuta = Array.from(
    new Set(item.movimentacoes.map((m) => m.documento).filter((d): d is string => !!d && d.startsWith("MIN-"))),
  );
  const minutas = numerosMinuta.length
    ? await prisma.minuta.findMany({
        where: { numero: { in: numerosMinuta } },
        select: { numero: true, numeroFisico: true, dataEmissao: true, dataEntrega: true },
      })
    : [];
  const minutaPorNumero = new Map(minutas.map((mn) => [mn.numero, mn]));
  const movimentacoes = item.movimentacoes.map((m) => {
    const mn = m.documento ? minutaPorNumero.get(m.documento) : undefined;
    return {
      ...m,
      minutaFisica: mn?.numeroFisico ?? null,
      minutaDataEmissao: mn?.dataEmissao ?? null,
      minutaDataEntrega: mn?.dataEntrega ?? null,
    };
  });

  // Alias produtosFornecedor → fornecedores for frontend compatibility
  const { produtosFornecedor, ...rest } = item;
  return NextResponse.json({ data: { ...rest, movimentacoes, fornecedores: produtosFornecedor } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
  const body = await req.json();

  const updateData: Record<string, unknown> = {};
  // codigo is auto-generated and immutable — never updated via PATCH
  if (body.descricao   !== undefined) updateData.descricao   = body.descricao;
  if (body.tipo        !== undefined) updateData.tipo        = body.tipo;
  if (body.unidadeId   !== undefined) updateData.unidadeId   = body.unidadeId || null;
  if (body.tipoProdutoId !== undefined) updateData.tipoProdutoId = body.tipoProdutoId || null;
  if (body.ncm         !== undefined) updateData.ncm         = body.ncm || null;
  if (body.precoVenda  !== undefined) updateData.precoVenda  = parseFloat(body.precoVenda) || 0;
  // precoCusto is auto-maintained by CMPM (entrada movements) — never updated via PATCH
  if (body.ativo       !== undefined) updateData.ativo       = body.ativo;
  if (body.favorito    !== undefined) updateData.favorito    = Boolean(body.favorito);
  if (body.vendavel    !== undefined) updateData.vendavel    = Boolean(body.vendavel);
  if (body.comodato   !== undefined) updateData.comodato   = Boolean(body.comodato);
  if (body.estoqueMinimo  !== undefined) updateData.estoqueMinimo  = body.estoqueMinimo  != null ? parseFloat(body.estoqueMinimo)  : null;
  if (body.estoqueMaximo  !== undefined) updateData.estoqueMaximo  = body.estoqueMaximo  != null ? parseFloat(body.estoqueMaximo)  : null;
  if (body.pontoReposicao !== undefined) updateData.pontoReposicao = body.pontoReposicao != null ? parseFloat(body.pontoReposicao) : null;
  if (body.leadTimeDias   !== undefined) updateData.leadTimeDias   = body.leadTimeDias   != null ? parseInt(body.leadTimeDias)     : null;
  if (body.observacoes    !== undefined) updateData.observacoes    = body.observacoes    || null;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.item.update({ where: { id: params.id }, data: updateData });

    // Sync principal ItemUnidade when unidadeId changes
    if (body.unidadeId !== undefined) {
      const newUnidadeId = body.unidadeId || null;
      await tx.itemUnidade.updateMany({
        where: { itemId: params.id, isPrincipal: true },
        data:  { isPrincipal: false },
      });
      if (newUnidadeId) {
        await tx.itemUnidade.upsert({
          where:  { itemId_unidadeId: { itemId: params.id, unidadeId: newUnidadeId } },
          create: { itemId: params.id, unidadeId: newUnidadeId, isPrincipal: true, fatorConversao: null, baseUnidadeId: null },
          update: { isPrincipal: true },
        });
      }
    }

    return tx.item.findUnique({
      where: { id: params.id },
      include: {
        tipoProduto: true,
        unidade: true,
        estoqueItems: {
          include: {
            localEstoque: {
              include: { filial: { select: { id: true, razaoSocial: true, nomeFantasia: true } } },
            },
          },
        },
        produtosFornecedor: {
          include: { fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } } },
        },
      },
    });
  });

  if (!updated) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  const { produtosFornecedor, ...rest } = updated;
  return NextResponse.json({ data: { ...rest, fornecedores: produtosFornecedor } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno ao atualizar produto";
    console.error("[PATCH /api/suprimentos/produtos/[id]]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const item = await prisma.item.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: {
            pedidoVendaItens: true,
            necessidadeCompraItens: true,
            cotacaoFornecedorItens: true,
            pedidoCompraItens: true,
            conferenciaCompraItens: true,
          },
        },
      },
    });

    if (!item) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

    const total =
      item._count.pedidoVendaItens +
      item._count.necessidadeCompraItens +
      item._count.cotacaoFornecedorItens +
      item._count.pedidoCompraItens +
      item._count.conferenciaCompraItens;

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
