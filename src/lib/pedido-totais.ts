import { Prisma } from "@prisma/client";
import { decimalToNumber } from "@/lib/utils";

/**
 * Recalcula e persiste os totais monetários de um pedido a partir dos seus
 * filhos atuais (itens + comodato), mantendo tudo consistente:
 *
 *   valorProdutos = Σ pedidoVendaItem.valorTotal
 *   valorComodato = Σ (SAIDA ? +1 : -1) × quantidade × valorUnitario   (só deste pedido)
 *   valorTotal    = valorProdutos − valorDesconto + valorFrete + valorComodato
 *
 * O comodato (vasilhames/pallets que o cliente leva) ENTRA no total do pedido —
 * o cliente é cobrado também pelos itens em comodato. Apenas as movimentações
 * amarradas a este pedido (pedidoVendaId) contam; lançamentos avulsos da tela
 * /comodato (sem pedidoVendaId) nunca afetam nenhum pedido.
 *
 * Deve rodar dentro de uma transação para que a leitura dos filhos e a escrita
 * do total sejam consistentes.
 */
export async function recalcPedidoValorTotal(tx: Prisma.TransactionClient, pedidoVendaId: string) {
  const pedido = await tx.pedidoVenda.findUnique({
    where: { id: pedidoVendaId },
    select: { valorDesconto: true, valorFrete: true },
  });
  if (!pedido) return null;

  const [itens, movs] = await Promise.all([
    tx.pedidoVendaItem.findMany({ where: { pedidoVendaId }, select: { valorTotal: true } }),
    tx.movimentacaoComodato.findMany({
      where: { pedidoVendaId },
      select: { tipo: true, quantidade: true, valorUnitario: true },
    }),
  ]);

  const valorProdutos = itens.reduce((s, i) => s + decimalToNumber(i.valorTotal), 0);
  const valorComodato = movs.reduce(
    (s, m) => s + (m.tipo === "SAIDA" ? 1 : -1) * decimalToNumber(m.quantidade) * decimalToNumber(m.valorUnitario),
    0,
  );
  const valorDesconto = decimalToNumber(pedido.valorDesconto);
  const valorFrete = decimalToNumber(pedido.valorFrete);
  const valorTotal = valorProdutos - valorDesconto + valorFrete + valorComodato;

  return tx.pedidoVenda.update({
    where: { id: pedidoVendaId },
    data: { valorProdutos, valorTotal },
  });
}
