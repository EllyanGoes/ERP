export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { notifyMovimentacao } from "@/lib/notify-estoque";
import { assertSaldoNaoNegativo, respostaSaldoNegativo, SaldoNegativoError, type ItemSaldoNegativo } from "@/lib/estoque-guard";

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
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const body = await req.json();

  try {
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

      // Trava de saldo negativo: nenhuma requisição (SAÍDA) pode deixar item negativo.
      const negativos: ItemSaldoNegativo[] = [];

      for (const item of updated.itens) {
        const qtd = parseFloat(String(item.quantidade));
        if (qtd <= 0) continue;

        const estoqueItem = await tx.estoqueItem.findFirst({
          where: { itemId: item.itemId, localEstoqueId, clienteDonoId: null },
          select: { id: true, quantidadeAtual: true },
        });

        // increment/decrement atômico: requisições concorrentes do mesmo item
        // não perdem atualização; os saldos da linha derivam do valor pós-update.
        // NOTA: o clamp Math.max(0, ...) foi removido — ele deixava o saldo da
        // tabela inconsistente com o extrato (recalcularSaldos subtrai a
        // quantidade cheia); o resto do sistema permite saldo negativo.
        let saldoAntes = 0;
        let saldoDepois = 0;
        if (estoqueItem) {
          const atualizado = await tx.estoqueItem.update({
            where: { id: estoqueItem.id },
            data:  { quantidadeAtual: { increment: isSaida ? -qtd : qtd } },
          });
          saldoDepois = parseFloat(String(atualizado.quantidadeAtual));
          saldoAntes  = isSaida ? saldoDepois + qtd : saldoDepois - qtd;
          if (isSaida && saldoDepois < 0) {
            negativos.push({ itemId: item.itemId, descricao: item.item.descricao, saldoAtual: saldoAntes, saldoDepois });
          }
        } else if (!isSaida) {
          // Para devoluções, cria o registro de estoque se não existir
          saldoDepois = qtd;
          await tx.estoqueItem.create({
            data: {
              itemId: item.itemId,
              clienteDonoId: null,
              quantidadeAtual: qtd,
              quantidadeMin: 0,
              localEstoqueId,
            },
          });
        }

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
      }

      // Aborta (rollback) se qualquer item da requisição ficou negativo.
      assertSaldoNaoNegativo(negativos);
    }

    return updated;
    });

  // Notify Telegram when ATENDIDA (best-effort, outside transaction)
  if (body.status === "ATENDIDA" && record.tipo !== undefined) {
    const isSaida = record.tipo === "REQUISICAO";
    const movTipo = isSaida ? "SAIDA" : "ENTRADA";
    const localEstoqueId = record.localEstoqueId ?? undefined;

    for (const item of record.itens) {
      const qtd = parseFloat(String(item.quantidade));
      if (qtd <= 0) continue;

      prisma.estoqueItem.findFirst({
        where: { itemId: item.itemId, clienteDonoId: null, ...(localEstoqueId ? { localEstoqueId } : {}) },
        include: { localEstoque: { select: { nome: true } } },
      }).then((estoqueAtual) => {
        notifyMovimentacao({
          tipo: movTipo,
          itemDescricao: item.item.descricao,
          itemCodigo: item.item.codigo ?? null,
          quantidade: qtd,
          saldoDepois: estoqueAtual ? parseFloat(String(estoqueAtual.quantidadeAtual)) : 0,
          unidade: item.item.unidade?.sigla ?? item.item.unidadeMedida ?? "un",
          localNome: estoqueAtual?.localEstoque?.nome ?? null,
          documento: record.numero,
          observacoes: `${isSaida ? "Requisição" : "Devolução"} de Material ${record.numero}`,
          quantidadeMin: estoqueAtual?.quantidadeMin != null ? parseFloat(String(estoqueAtual.quantidadeMin)) : null,
        });
      }).catch(() => {});
    }
  }

  return NextResponse.json({ data: record });
  } catch (err) {
    if (err instanceof SaldoNegativoError) return respostaSaldoNegativo(err);
    throw err;
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  await prisma.requisicaoMaterial.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
