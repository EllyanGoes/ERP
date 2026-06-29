export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { notifyMovimentacao } from "@/lib/notify-estoque";
import { assertSaldoNaoNegativo, respostaSaldoNegativo, SaldoNegativoError, type ItemSaldoNegativo } from "@/lib/estoque-guard";
import { assertItensPermitidosNosLocais, CategoriaLocalInvalidaError, respostaCategoriaInvalida } from "@/lib/estoque-categoria";
import { recontabilizarRequisicao, recontabilizarLoteMovimentacao } from "@/lib/contabilidade";
import { custosComFallback } from "@/lib/custo-empresa";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.requisicaoMaterial.findUnique({
    where: { id: params.id },
    include: {
      localEstoque: { select: { id: true, nome: true } },
      localDestino: { select: { id: true, nome: true } },
      colaborador:  { select: { id: true, nome: true } },
      setor:        { select: { id: true, nome: true } },
      almoxarife:   { select: { id: true, nome: true } },
      centroCusto:  { select: { id: true, codigo: true, nome: true } },
      itens: {
        include: {
          item:       { select: { id: true, codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
          centroCusto: { select: { id: true, codigo: true, nome: true } },
          naturezaFinanceira: { select: { id: true, nome: true, cif: true } },
        },
      },
    },
  });
  if (!record) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  // Custo do material na empresa (fallback no CMPM global) → preço unit. + total por item.
  const custos = await custosComFallback(prisma, record.empresaId, record.itens.map((it) => it.itemId));
  const itens = record.itens.map((it) => {
    const custoUnitario = custos.get(it.itemId) ?? 0;
    const valorTotal = Math.round(parseFloat(String(it.quantidade)) * custoUnitario * 100) / 100;
    return { ...it, custoUnitario, valorTotal };
  });
  const valorTotal = Math.round(itens.reduce((s, it) => s + it.valorTotal, 0) * 100) / 100;
  return NextResponse.json({ data: { ...record, itens, valorTotal } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const body = await req.json();

  let loteTransferId: string | null = null; // setado no modo transferência (libera p/ outro local)

  try {
    const record = await prisma.$transaction(async (tx) => {
    const updateData: Record<string, unknown> = {};

    if (body.status        !== undefined) updateData.status        = body.status;
    if (body.tipo          !== undefined) updateData.tipo          = body.tipo;
    if (body.colaboradorId !== undefined) updateData.colaboradorId = body.colaboradorId || null;
    if (body.setorId       !== undefined) updateData.setorId       = body.setorId       || null;
    if (body.almoxarifeId  !== undefined) updateData.almoxarifeId  = body.almoxarifeId  || null;
    if (body.localDestinoId !== undefined) updateData.localDestinoId = body.localDestinoId || null;
    if (body.os            !== undefined) updateData.os            = body.os?.trim()    || null;
    if (body.centroCustoId !== undefined) updateData.centroCustoId = body.centroCustoId || null;
    if (body.naturezaFinanceiraId !== undefined) updateData.naturezaFinanceiraId = body.naturezaFinanceiraId || null;
    if (body.data          !== undefined) updateData.data          = body.data ? new Date(body.data) : null;
    if (body.observacoes   !== undefined) updateData.observacoes   = body.observacoes?.trim() || null;

    if (Array.isArray(body.itens)) {
      await tx.requisicaoMaterialItem.deleteMany({ where: { requisicaoId: params.id } });
      updateData.itens = {
        create: body.itens.map((it: {
          itemId: string; quantidade: number; unidade?: string;
          localizacao?: string; centroCustoId?: string; naturezaFinanceiraId?: string;
          destinoManual?: string; os?: string; requisicaoRef?: string;
        }) => ({
          itemId:       it.itemId,
          quantidade:   parseFloat(String(it.quantidade)),
          unidade:      it.unidade?.trim()        || null,
          localizacao:  it.localizacao?.trim()    || null,
          centroCustoId: it.centroCustoId         || null,
          naturezaFinanceiraId: it.naturezaFinanceiraId || body.naturezaFinanceiraId || null,
          destinoManual: (it.destinoManual as never) || null,
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
    if (updated.localDestinoId) {
      // ── Modo TRANSFERÊNCIA: LIBERA (move) os itens da origem p/ o destino ──────
      // Ex.: o almoxarife libera embalagem do almoxarifado p/ o estoque de produção.
      // NÃO baixa/consome (sem despesa): o custo só sai quando a produção consome.
      // Saída na origem + entrada no destino, agrupadas num lote → D destino / C origem.
      const destinoId = updated.localDestinoId;
      const itensComQtd = updated.itens.filter((i) => parseFloat(String(i.quantidade)) > 0);
      // Bloqueio de categoria na ENTRADA (destino) — só entra o que o local aceita.
      await assertItensPermitidosNosLocais(tx, itensComQtd.map((i) => ({ itemId: i.itemId, localEstoqueId: destinoId })));

      const year = new Date().getFullYear();
      const seq = await tx.sequencia.upsert({
        where: { empresaId_prefixo: { empresaId: updated.empresaId, prefixo: "MOV" } },
        create: { empresaId: updated.empresaId, prefixo: "MOV", ultimo: 1 },
        update: { ultimo: { increment: 1 } },
      });
      const lote = await tx.loteMovimentacao.create({
        data: {
          empresaId: updated.empresaId, numero: `MOV-${year}-${String(seq.ultimo).padStart(4, "0")}`,
          tipo: "TRANSFERENCIA", documento: updated.numero, observacoes: `Liberação de Material ${updated.numero}`,
        },
        select: { id: true },
      });
      loteTransferId = lote.id;

      const negativos: ItemSaldoNegativo[] = [];
      for (const item of itensComQtd) {
        const qtd = parseFloat(String(item.quantidade));
        // Origem: o local da requisição; se não houver saldo lá, o local com maior saldo.
        let origem = await tx.estoqueItem.findFirst({
          where: { itemId: item.itemId, localEstoqueId: updated.localEstoqueId, clienteDonoId: null },
          select: { id: true, localEstoqueId: true },
        });
        if (!origem) {
          origem = await tx.estoqueItem.findFirst({
            where: { itemId: item.itemId, empresaId: updated.empresaId, clienteDonoId: null, quantidadeAtual: { gt: 0 } },
            orderBy: { quantidadeAtual: "desc" },
            select: { id: true, localEstoqueId: true },
          });
        }
        const origemLocalId = origem?.localEstoqueId ?? updated.localEstoqueId;

        // Perna de SAÍDA (origem).
        let saldoAntes = 0, saldoDepois = 0;
        if (origem) {
          const upd = await tx.estoqueItem.update({ where: { id: origem.id }, data: { quantidadeAtual: { increment: -qtd } } });
          saldoDepois = parseFloat(String(upd.quantidadeAtual));
          saldoAntes = saldoDepois + qtd;
        } else {
          saldoDepois = -qtd; saldoAntes = 0;
          await tx.estoqueItem.create({ data: { empresaId: updated.empresaId, itemId: item.itemId, clienteDonoId: null, quantidadeAtual: saldoDepois, quantidadeMin: 0, localEstoqueId: origemLocalId } });
        }
        if (saldoDepois < 0) negativos.push({ itemId: item.itemId, descricao: item.item.descricao, saldoAtual: saldoAntes, saldoDepois });
        await tx.movimentacaoEstoque.create({
          data: {
            empresaId: updated.empresaId, itemId: item.itemId, tipo: "SAIDA", quantidade: qtd, saldoAntes, saldoDepois,
            documento: updated.numero, observacoes: `Liberação de Material ${updated.numero}`, localEstoqueId: origemLocalId, loteId: lote.id,
          },
        });

        // Perna de ENTRADA (destino).
        const dest = await tx.estoqueItem.findFirst({ where: { itemId: item.itemId, localEstoqueId: destinoId, clienteDonoId: null }, select: { id: true } });
        let dAntes = 0, dDepois = 0;
        if (dest) {
          const upd = await tx.estoqueItem.update({ where: { id: dest.id }, data: { quantidadeAtual: { increment: qtd } } });
          dDepois = parseFloat(String(upd.quantidadeAtual)); dAntes = dDepois - qtd;
        } else {
          dAntes = 0; dDepois = qtd;
          await tx.estoqueItem.create({ data: { empresaId: updated.empresaId, itemId: item.itemId, clienteDonoId: null, quantidadeAtual: qtd, quantidadeMin: 0, localEstoqueId: destinoId } });
        }
        await tx.movimentacaoEstoque.create({
          data: {
            empresaId: updated.empresaId, itemId: item.itemId, tipo: "ENTRADA", quantidade: qtd, saldoAntes: dAntes, saldoDepois: dDepois,
            documento: updated.numero, observacoes: `Liberação de Material ${updated.numero}`, localEstoqueId: destinoId, loteId: lote.id,
          },
        });
      }
      if (body.permitirSaldoNegativo !== true) assertSaldoNaoNegativo(negativos);
    } else {
      const isSaida = updated.tipo === "REQUISICAO";
      const movTipo = isSaida ? "SAIDA" : "ENTRADA";
      const localEstoqueId = updated.localEstoqueId;

      // Trava de saldo negativo: nenhuma requisição (SAÍDA) pode deixar item negativo.
      const negativos: ItemSaldoNegativo[] = [];

      for (const item of updated.itens) {
        const qtd = parseFloat(String(item.quantidade));
        if (qtd <= 0) continue;

        let estoqueItem = await tx.estoqueItem.findFirst({
          where: { itemId: item.itemId, localEstoqueId, clienteDonoId: null },
          select: { id: true, quantidadeAtual: true, localEstoqueId: true },
        });
        // SAÍDA sem registro no local da requisição: o item pode ter sido
        // reclassificado/transferido para outro local. Baixa de onde ele
        // realmente está (local com maior saldo) — senão a saída sairia
        // "fantasma" (saldo 0→0 sem baixar nada, como vinha ocorrendo).
        if (!estoqueItem && isSaida) {
          estoqueItem = await tx.estoqueItem.findFirst({
            where: { itemId: item.itemId, empresaId: updated.empresaId, clienteDonoId: null, quantidadeAtual: { gt: 0 } },
            orderBy: { quantidadeAtual: "desc" },
            select: { id: true, quantidadeAtual: true, localEstoqueId: true },
          });
        }
        // Local efetivo de onde a baixa sai (= onde o item está, com fallback
        // para o local da requisição quando não há estoque em lugar nenhum).
        const localEfetivo = estoqueItem?.localEstoqueId ?? localEstoqueId;

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
        } else {
          // Sem estoque do item em nenhum local: SAÍDA cria saldo NEGATIVO no
          // local da requisição (consumo real — o saldo se ajusta depois);
          // devolução cria saldo positivo. Nunca mais uma saída fantasma 0→0.
          saldoDepois = isSaida ? -qtd : qtd;
          saldoAntes = 0;
          await tx.estoqueItem.create({
            data: {
              empresaId: updated.empresaId,
              itemId: item.itemId,
              clienteDonoId: null,
              quantidadeAtual: saldoDepois,
              quantidadeMin: 0,
              localEstoqueId: localEfetivo,
            },
          });
          if (isSaida) {
            negativos.push({ itemId: item.itemId, descricao: item.item.descricao, saldoAtual: 0, saldoDepois });
          }
        }

        await tx.movimentacaoEstoque.create({
          data: {
            empresaId:    updated.empresaId,
            itemId:       item.itemId,
            tipo:         movTipo,
            quantidade:   qtd,
            saldoAntes,
            saldoDepois,
            documento:    updated.numero,
            observacoes:  `${isSaida ? "Requisição" : "Devolução"} de Material ${updated.numero}`,
            localEstoqueId: localEfetivo,
          },
        });
      }

      // Saldo negativo na requisição: por padrão devolve 422 com os itens (o
      // front avisa). Se o usuário confirmar (permitirSaldoNegativo), deixa
      // atender mesmo assim — requisição é consumo real; o saldo se ajusta depois.
      if (body.permitirSaldoNegativo !== true) assertSaldoNaoNegativo(negativos);
    }
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

  // Contábil ao atender (best-effort, pós-commit). Transferência (liberação p/ outro
  // local) → D conta-destino / C conta-origem pelo lote; consumo normal → D Consumo / C Estoque.
  if (record.status === "ATENDIDA") {
    if (loteTransferId) await recontabilizarLoteMovimentacao(loteTransferId).catch(() => {});
    else await recontabilizarRequisicao(params.id).catch(() => {});
  }

  return NextResponse.json({ data: record });
  } catch (err) {
    if (err instanceof SaldoNegativoError) return respostaSaldoNegativo(err);
    if (err instanceof CategoriaLocalInvalidaError) return respostaCategoriaInvalida(err);
    throw err;
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  await prisma.requisicaoMaterial.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
