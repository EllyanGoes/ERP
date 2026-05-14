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
        // Get current stock
        const estoqueItem = await tx.estoqueItem.findFirst({
          where: { itemId: item.itemId, localEstoqueId: null },
          select: { id: true, quantidadeAtual: true },
        });

        const saldoAntes = estoqueItem ? parseFloat(String(estoqueItem.quantidadeAtual)) : 0;
        const saldoDepois = saldoAntes + qtdRecebida;

        // Create stock movement
        const mov = await tx.movimentacaoEstoque.create({
          data: {
            itemId: item.itemId,
            tipo: "ENTRADA",
            quantidade: qtdRecebida,
            saldoAntes,
            saldoDepois,
            documento: conferencia.numero,
            observacoes: `Recebimento ${conferencia.pedido.numero}`,
            conferenciaItemId: item.id,
          },
        });

        movimentacoesCriadas.push(mov.id);

        // Update or create stock record (no specific location)
        if (estoqueItem) {
          await tx.estoqueItem.update({ where: { id: estoqueItem.id }, data: { quantidadeAtual: saldoDepois } });
        } else {
          await tx.estoqueItem.create({ data: { itemId: item.itemId, quantidadeAtual: saldoDepois, quantidadeMin: 0 } });
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
        itens: {
          include: {
            item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } },
            movimentacoes: true,
          },
        },
      },
    });

    // Update pedido to RECEBIDO
    await tx.pedidoCompra.update({
      where: { id: conferencia.pedidoId },
      data: { status: "RECEBIDO" },
    });

    // ── Auto-link items to supplier ───────────────────────────────────────────
    const fornecedorId = conferencia.pedido.fornecedorId;
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

    return { conferencia: updatedConferencia, movimentacoesCriadas, autoVinculos };
  });

  return NextResponse.json({ data: result.conferencia, movimentacoesCriadas: result.movimentacoesCriadas, autoVinculos: result.autoVinculos });
}
