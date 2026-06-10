import type { Prisma } from "@prisma/client";

const num = (d: unknown) => parseFloat(String(d));
const r3 = (x: number) => Math.round(x * 1000) / 1000; // saldos têm 3 casas (Decimal(15,3))

/**
 * Recalcula a coluna de saldo corrido (saldoAntes/saldoDepois) de TODAS as
 * movimentações de um (item + local de estoque), em ordem cronológica, ancorando
 * o saldoDepois da última ao EstoqueItem.quantidadeAtual — que é a fonte da
 * verdade do saldo atual.
 *
 * Deve ser chamado DENTRO de uma transação sempre que a quantidade de uma
 * movimentação já existente for alterada (edição de minuta, edição manual, etc.).
 * Sem isso, as linhas seguintes ficam com o "Saldo Depois" defasado.
 *
 * O efeito de cada linha no saldo vem do seu tipo (ENTRADA soma, SAIDA subtrai);
 * tipos atípicos (AJUSTE/TRANSFERÊNCIA) usam o efeito já gravado (saldoDepois−saldoAntes),
 * que é intrínseco à linha e não se altera com o reordenamento da cadeia.
 *
 * `clienteDonoId` particiona a cadeia por proprietário: null = estoque próprio,
 * preenchido = mercadoria de terceiro sob guarda (cada dono tem o seu extrato).
 */
export async function recalcularSaldos(
  tx: Prisma.TransactionClient,
  itemId: string,
  localEstoqueId: string,
  clienteDonoId: string | null,
): Promise<void> {
  const [estoque, movs] = await Promise.all([
    tx.estoqueItem.findFirst({
      where: { itemId, localEstoqueId, clienteDonoId },
      select: { quantidadeAtual: true },
    }),
    tx.movimentacaoEstoque.findMany({
      where: { itemId, localEstoqueId, clienteDonoId },
      select: {
        id: true, tipo: true, quantidade: true,
        saldoAntes: true, saldoDepois: true, createdAt: true,
        lote: { select: { dataMovimentacao: true } },
      },
    }),
  ]);

  // Mesma ordem do extrato: por (lote.dataMovimentacao ?? createdAt); createdAt e id como desempate.
  movs.sort((a, b) => {
    const da = new Date(a.lote?.dataMovimentacao ?? a.createdAt).getTime();
    const db = new Date(b.lote?.dataMovimentacao ?? b.createdAt).getTime();
    if (da !== db) return da - db;
    const ca = new Date(a.createdAt).getTime();
    const cb = new Date(b.createdAt).getTime();
    if (ca !== cb) return ca - cb;
    return a.id.localeCompare(b.id);
  });

  // Caminha de trás pra frente, ancorando o saldoDepois da última ao saldo atual.
  let saldo = estoque ? num(estoque.quantidadeAtual) : 0;
  for (let i = movs.length - 1; i >= 0; i--) {
    const m = movs[i];
    const efeito =
      m.tipo === "ENTRADA" ? num(m.quantidade)
      : m.tipo === "SAIDA" ? -num(m.quantidade)
      : num(m.saldoDepois) - num(m.saldoAntes);
    const saldoDepois = r3(saldo);
    const saldoAntes = r3(saldo - efeito);
    await tx.movimentacaoEstoque.update({
      where: { id: m.id },
      data: { saldoAntes, saldoDepois },
    });
    saldo -= efeito;
  }
}
