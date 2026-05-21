export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const responsavel = body.responsavel || null;

  const result = await prisma.$transaction(async (tx) => {
    const conferencia = await tx.conferenciaCompra.findUnique({
      where: { id: params.id },
      include: {
        pedido: { select: { id: true, numero: true, fornecedorId: true } },
        itens: {
          include: { item: true },
        },
      },
    });

    if (!conferencia) throw new Error("Conferência não encontrada");
    if (conferencia.status === "CONCLUIDA") throw new Error("Conferência já concluída");

    let hasDivergencia = false;
    const movimentacoesCriadas: string[] = [];

    for (const item of conferencia.itens) {
      const qtdRecebida = parseFloat(String(item.quantidadeRecebida ?? 0));
      const qtdPedida = parseFloat(String(item.quantidadePedida));

      if (Math.abs(qtdRecebida - qtdPedida) > 0.001) {
        hasDivergencia = true;
      }

      if (qtdRecebida > 0) {
        // Use item-specific localEstoqueId if set, otherwise fall back to null (global stock)
        const targetLocalEstoqueId = item.localEstoqueId ?? null;

        // Get current stock for this location
        const estoqueItem = await tx.estoqueItem.findFirst({
          where: { itemId: item.itemId, localEstoqueId: targetLocalEstoqueId },
          select: { id: true, quantidadeAtual: true },
        });

        const saldoAntes = estoqueItem ? parseFloat(String(estoqueItem.quantidadeAtual)) : 0;
        const saldoDepois = saldoAntes + qtdRecebida;

        // Determine document reference
        const docRef = conferencia.pedido?.numero
          ? `Recebimento ${conferencia.pedido.numero}`
          : `Recebimento ${conferencia.numero}`;

        // Create stock movement
        const mov = await tx.movimentacaoEstoque.create({
          data: {
            itemId: item.itemId,
            tipo: "ENTRADA",
            quantidade: qtdRecebida,
            saldoAntes,
            saldoDepois,
            documento: conferencia.numero,
            observacoes: docRef,
            conferenciaItemId: item.id,
            localEstoqueId: targetLocalEstoqueId,
          },
        });

        movimentacoesCriadas.push(mov.id);

        // Update or create stock record
        if (estoqueItem) {
          await tx.estoqueItem.update({
            where: { id: estoqueItem.id },
            data: { quantidadeAtual: saldoDepois },
          });
        } else {
          await tx.estoqueItem.create({
            data: {
              itemId: item.itemId,
              quantidadeAtual: saldoDepois,
              quantidadeMin: 0,
              localEstoqueId: targetLocalEstoqueId,
            },
          });
        }

        // Mark divergencia on item
        await tx.conferenciaCompraItem.update({
          where: { id: item.id },
          data: {
            divergencia: Math.abs(qtdRecebida - qtdPedida) > 0.001,
          },
        });
      }
    }

    const finalStatus = hasDivergencia ? "DIVERGENCIA" : "CONCLUIDA";

    // Update conferencia status
    const updatedConferencia = await tx.conferenciaCompra.update({
      where: { id: params.id },
      data: {
        status: finalStatus,
        dataConferencia: new Date(),
        ...(responsavel ? { responsavel } : {}),
      },
      include: {
        pedido: {
          include: { fornecedor: { select: { id: true, razaoSocial: true } } },
        },
        fornecedor: { select: { id: true, razaoSocial: true } },
        itens: {
          include: {
            item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } },
            movimentacoes: true,
          },
        },
      },
    });

    // Track which SCs were updated (for user notification)
    const scAtualizadas: Array<{ numero: string; status: string }> = [];

    // Helper: compute and update SC status given a necessidadeId
    async function atualizarStatusSC(necessidadeId: string) {
      const necessidade = await tx.necessidadeCompra.findUnique({
        where: { id: necessidadeId },
        select: {
          numero: true,
          status: true,
          itens: { select: { itemId: true, quantidade: true } },
        },
      });
      if (!necessidade) return;
      // Only update if SC is in a relevant status
      const statusElegiveis = ["EM_COTACAO", "APROVADA", "PARCIALMENTE_ATENDIDA", "TOTALMENTE_ATENDIDA"];
      if (!statusElegiveis.includes(necessidade.status)) return;

      const scItems = necessidade.itens;
      if (scItems.length === 0) return;

      // Find ALL pedidos linked to this SC (direct or via cotação)
      const pedidosDiretos = await tx.pedidoCompra.findMany({
        where: { necessidadeId, status: "RECEBIDO" },
        select: { id: true },
      });
      const cotacoesDaSc = await tx.cotacaoCompra.findMany({
        where: { necessidadeId },
        select: { id: true },
      });
      const cotacaoIds = cotacoesDaSc.map((c) => c.id);
      const pedidosDeCotacao = cotacaoIds.length > 0
        ? await tx.pedidoCompra.findMany({
            where: { cotacaoId: { in: cotacaoIds }, status: "RECEBIDO" },
            select: { id: true },
          })
        : [];

      const todosPedidoIds = [
        ...pedidosDiretos.map((p) => p.id),
        ...pedidosDeCotacao.map((p) => p.id),
      ];

      // Collect received quantities from concluded conferências
      const confsConcluidas = todosPedidoIds.length > 0
        ? await tx.conferenciaCompra.findMany({
            where: {
              pedidoId: { in: todosPedidoIds },
              status: { in: ["CONCLUIDA", "DIVERGENCIA"] },
            },
            select: {
              itens: { select: { itemId: true, quantidadeRecebida: true } },
            },
          })
        : [];

      const recebidoMap = new Map<string, number>();
      for (const conf of confsConcluidas) {
        for (const ci of conf.itens) {
          const prev = recebidoMap.get(ci.itemId) ?? 0;
          recebidoMap.set(ci.itemId, prev + parseFloat(String(ci.quantidadeRecebida ?? 0)));
        }
      }
      // Also include items being concluded in THIS conferência
      for (const ci of conferencia!.itens) {
        const prev = recebidoMap.get(ci.itemId) ?? 0;
        recebidoMap.set(ci.itemId, prev + parseFloat(String(ci.quantidadeRecebida ?? 0)));
      }

      // Check how many SC items are fully covered
      let totalAtendidos = 0;
      for (const scItem of scItems) {
        const recebido = recebidoMap.get(scItem.itemId) ?? 0;
        const necessario = parseFloat(String(scItem.quantidade));
        if (recebido >= necessario - 0.001) totalAtendidos++;
      }

      // Determine new status
      const algumAtendido = scItems.some((si) => (recebidoMap.get(si.itemId) ?? 0) > 0.001);
      const novoStatus =
        totalAtendidos >= scItems.length
          ? "TOTALMENTE_ATENDIDA"
          : algumAtendido
          ? "PARCIALMENTE_ATENDIDA"
          : null;

      if (novoStatus) {
        await tx.necessidadeCompra.update({
          where: { id: necessidadeId },
          data: { status: novoStatus },
        });
        scAtualizadas.push({ numero: necessidade.numero, status: novoStatus });
      }
    }

    // Update pedido to RECEBIDO (only if linked to a pedido)
    if (conferencia.pedidoId) {
      await tx.pedidoCompra.update({
        where: { id: conferencia.pedidoId },
        data: { status: "RECEBIDO" },
      });

      const pedido = await tx.pedidoCompra.findUnique({
        where: { id: conferencia.pedidoId },
        select: { cotacaoId: true, necessidadeId: true },
      });

      // Collect unique SC IDs to update
      const necessidadeIds = new Set<string>();

      // 1. Direct PC → SC link (new field)
      if (pedido?.necessidadeId) {
        necessidadeIds.add(pedido.necessidadeId);
      }

      // 2. PC → Cotação → SC link (existing path)
      if (pedido?.cotacaoId) {
        const cotacao = await tx.cotacaoCompra.findUnique({
          where: { id: pedido.cotacaoId },
          select: { necessidadeId: true },
        });
        if (cotacao?.necessidadeId) {
          necessidadeIds.add(cotacao.necessidadeId);
        }
      }

      // Update each unique SC
      for (const necessidadeId of Array.from(necessidadeIds)) {
        await atualizarStatusSC(necessidadeId);
      }
    }

    // ── Auto-link items to supplier ───────────────────────────────────────────
    const fornecedorId = conferencia.pedido?.fornecedorId ?? conferencia.fornecedorId;
    const autoVinculos: string[] = [];
    if (fornecedorId) {
      for (const item of conferencia.itens) {
        const qtdRecebida = parseFloat(String(item.quantidadeRecebida ?? 0));
        if (qtdRecebida <= 0) continue;
        const already = await tx.produtoFornecedor.findFirst({
          where: { itemId: item.itemId, fornecedorId },
        });
        if (!already) {
          await tx.produtoFornecedor.create({
            data: { itemId: item.itemId, fornecedorId },
          });
          autoVinculos.push(item.item.descricao);
        }
      }
    }

    return { conferencia: updatedConferencia, movimentacoesCriadas, autoVinculos, scAtualizadas };
  });

  return NextResponse.json({
    data: result.conferencia,
    movimentacoesCriadas: result.movimentacoesCriadas,
    autoVinculos: result.autoVinculos,
    scAtualizadas: result.scAtualizadas,
  });
}
