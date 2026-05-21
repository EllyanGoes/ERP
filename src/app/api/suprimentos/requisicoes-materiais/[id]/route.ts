export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.requisicaoMaterial.findUnique({
    where: { id: params.id },
    include: {
      localEstoque: { select: { id: true, nome: true } },
      colaborador:  { select: { id: true, nome: true } },
      setor:        { select: { id: true, nome: true } },
      almoxarife:   { select: { id: true, nome: true } },
      centroCusto:  { select: { id: true, codigo: true, nome: true } },
      itens: {
        include: {
          item:       { select: { id: true, codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
          centroCusto: { select: { id: true, codigo: true, nome: true } },
        },
      },
    },
  });
  if (!record) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ data: record });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  const record = await prisma.$transaction(async (tx) => {
    const updateData: Record<string, unknown> = {};

    if (body.status        !== undefined) updateData.status        = body.status;
    if (body.tipo          !== undefined) updateData.tipo          = body.tipo;
    if (body.colaboradorId !== undefined) updateData.colaboradorId = body.colaboradorId || null;
    if (body.setorId       !== undefined) updateData.setorId       = body.setorId       || null;
    if (body.almoxarifeId  !== undefined) updateData.almoxarifeId  = body.almoxarifeId  || null;
    if (body.os            !== undefined) updateData.os            = body.os?.trim()    || null;
    if (body.centroCustoId !== undefined) updateData.centroCustoId = body.centroCustoId || null;
    if (body.contaContabil !== undefined) updateData.contaContabil = body.contaContabil?.trim() || null;
    if (body.data          !== undefined) updateData.data          = body.data ? new Date(body.data) : null;
    if (body.observacoes   !== undefined) updateData.observacoes   = body.observacoes?.trim() || null;

    if (Array.isArray(body.itens)) {
      await tx.requisicaoMaterialItem.deleteMany({ where: { requisicaoId: params.id } });
      updateData.itens = {
        create: body.itens.map((it: {
          itemId: string; quantidade: number; unidade?: string;
          localizacao?: string; centroCustoId?: string; contaContabil?: string;
          os?: string; requisicaoRef?: string;
        }) => ({
          itemId:       it.itemId,
          quantidade:   parseFloat(String(it.quantidade)),
          unidade:      it.unidade?.trim()        || null,
          localizacao:  it.localizacao?.trim()    || null,
          centroCustoId: it.centroCustoId         || null,
          contaContabil: it.contaContabil?.trim() || null,
          os:           it.os?.trim()             || null,
          requisicaoRef: it.requisicaoRef?.trim() || null,
        })),
      };
    }

    const updated = await tx.requisicaoMaterial.update({
      where: { id: params.id },
      data: updateData,
      include: {
        localEstoque: { select: { id: true, nome: true } },
        colaborador:  { select: { id: true, nome: true } },
        setor:        { select: { id: true, nome: true } },
        almoxarife:   { select: { id: true, nome: true } },
        centroCusto:  { select: { id: true, codigo: true, nome: true } },
        itens: {
          include: {
            item:        { select: { id: true, codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
            centroCusto: { select: { id: true, codigo: true, nome: true } },
          },
        },
      },
    });

    // ── Stock deduction when ATENDIDA ──────────────────────────────────────────
    // For REQUISICAO: deduct from stock (SAIDA)
    // For DEVOLUCAO: return to stock (ENTRADA)
    if (body.status === "ATENDIDA" && updated.tipo !== undefined) {
      const isSaida = updated.tipo === "REQUISICAO";
      const movTipo = isSaida ? "SAIDA" : "ENTRADA";
      const localEstoqueId = updated.localEstoqueId;

      for (const item of updated.itens) {
        const qtd = parseFloat(String(item.quantidade));
        if (qtd <= 0) continue;

        const estoqueItem = await tx.estoqueItem.findFirst({
          where: { itemId: item.itemId, localEstoqueId },
          select: { id: true, quantidadeAtual: true },
        });

        const saldoAntes = estoqueItem ? parseFloat(String(estoqueItem.quantidadeAtual)) : 0;
        const saldoDepois = isSaida
          ? Math.max(0, saldoAntes - qtd)
          : saldoAntes + qtd;

        await tx.movimentacaoEstoque.create({
          data: {
            itemId:       item.itemId,
            tipo:         movTipo,
            quantidade:   qtd,
            saldoAntes,
            saldoDepois,
            documento:    updated.numero,
            observacoes:  `${isSaida ? "Requisição" : "Devolução"} de Material ${updated.numero}`,
            localEstoqueId,
          },
        });

        if (estoqueItem) {
          await tx.estoqueItem.update({
            where: { id: estoqueItem.id },
            data: { quantidadeAtual: saldoDepois },
          });
        } else if (!isSaida) {
          // For devoluções, create estoque record if it doesn't exist
          await tx.estoqueItem.create({
            data: {
              itemId: item.itemId,
              quantidadeAtual: saldoDepois,
              quantidadeMin: 0,
              localEstoqueId,
            },
          });
        }
      }
    }

    return updated;
  });

  return NextResponse.json({ data: record });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.requisicaoMaterial.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
