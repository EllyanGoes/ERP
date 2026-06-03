import { Prisma } from "@prisma/client";

/**
 * Reverte o estoque e exclui os Documentos de Entrada (ConferenciaCompra) informados.
 *
 * Usado na exclusão forçada (admin) de Cotação / Solicitação de Compras: ao remover
 * os pedidos de compra, os documentos de entrada vinculados também são apagados — e
 * o estoque que eles lançaram precisa ser revertido para não corromper os saldos.
 *
 * A reversão é feita a partir das MOVIMENTAÇÕES reais geradas pela NF
 * (MovimentacaoEstoque.conferenciaItemId): cada ENTRADA é subtraída do saldo do
 * local correspondente (com piso em 0). O preço de custo médio (CMPM) NÃO é
 * recalculado — é uma média ponderada histórica não reversível de forma determinística.
 *
 * Deve ser chamada DENTRO de uma transação (recebe o tx client).
 */
export async function reverterEExcluirConferencias(
  tx: Prisma.TransactionClient,
  conferenciaIds: string[],
): Promise<void> {
  if (conferenciaIds.length === 0) return;

  const itens = await tx.conferenciaCompraItem.findMany({
    where: { conferenciaId: { in: conferenciaIds } },
    select: { id: true },
  });
  const itemIds = itens.map((i) => i.id);

  if (itemIds.length > 0) {
    const movs = await tx.movimentacaoEstoque.findMany({
      where: { conferenciaItemId: { in: itemIds } },
      select: { id: true, itemId: true, localEstoqueId: true, quantidade: true, tipo: true },
    });

    for (const m of movs) {
      // ENTRADA somou ao estoque → subtrai para reverter. (Conferência só gera ENTRADA.)
      const delta = m.tipo === "ENTRADA" ? -Number(m.quantidade) : Number(m.quantidade);
      const ei = await tx.estoqueItem.findFirst({
        where: { itemId: m.itemId, localEstoqueId: m.localEstoqueId },
        select: { id: true, quantidadeAtual: true },
      });
      if (ei) {
        const novo = Number(ei.quantidadeAtual) + delta;
        await tx.estoqueItem.update({
          where: { id: ei.id },
          data: { quantidadeAtual: novo < 0 ? 0 : novo },
        });
      }
    }

    // Remove as movimentações da NF antes de apagar a conferência (senão ficam órfãs).
    await tx.movimentacaoEstoque.deleteMany({ where: { conferenciaItemId: { in: itemIds } } });
  }

  // Apaga os documentos de entrada (itens cascateiam).
  await tx.conferenciaCompra.deleteMany({ where: { id: { in: conferenciaIds } } });
}
