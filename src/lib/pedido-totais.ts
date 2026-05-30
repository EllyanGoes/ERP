import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

export type ItemPendenteEntrega = {
  codigo: string;
  descricao: string;
  unidade: string;
  pedida: number;
  entregue: number;
  pendente: number;
};

/**
 * Lista os itens do pedido que ainda têm saldo NÃO entregue
 * (quantidade pedida − quantidade já confirmada em minutas ENTREGUE).
 *
 * Lista vazia ⇒ todo o material foi entregue, e o pedido pode ser concluído.
 * É a regra inversa da auto-conclusão (checkAndConcludePedido): aqui usamos a
 * mesma definição de "entregue" (somente minutas com status ENTREGUE contam).
 */
export async function getItensPendentesEntrega(pedidoVendaId: string): Promise<ItemPendenteEntrega[]> {
  const pedido = await prisma.pedidoVenda.findUnique({
    where: { id: pedidoVendaId },
    select: {
      itens: {
        select: {
          quantidade: true,
          item: {
            select: { codigo: true, descricao: true, unidade: { select: { sigla: true } } },
          },
          minutaItens: {
            where: { minuta: { status: "ENTREGUE" } },
            select: { quantidade: true },
          },
        },
      },
    },
  });
  if (!pedido) return [];

  return pedido.itens
    .map((it) => {
      const pedida = decimalToNumber(it.quantidade);
      const entregue = it.minutaItens.reduce((s, mi) => s + decimalToNumber(mi.quantidade), 0);
      return {
        codigo: it.item.codigo,
        descricao: it.item.descricao,
        unidade: it.item.unidade?.sigla ?? "UN",
        pedida,
        entregue,
        pendente: pedida - entregue,
      };
    })
    .filter((p) => p.pendente > 0.0001);
}

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
