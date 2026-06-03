import { prisma } from "@/lib/prisma";

/**
 * Saldo de uma conta = saldoInicial + Σ RECEITA − Σ DESPESA + Σ TRANSFERENCIA.
 * As pernas de transferência são gravadas com `valor` já sinalizado (negativo na
 * conta de origem, positivo na de destino), então TRANSFERENCIA apenas soma.
 */
export async function saldosTodasContas(): Promise<Map<string, number>> {
  const contas = await prisma.contaBancaria.findMany({ select: { id: true, saldoInicial: true } });
  const agg = await prisma.lancamentoFinanceiro.groupBy({
    by: ["contaBancariaId", "tipo"],
    _sum: { valor: true },
  });
  const map = new Map<string, number>();
  for (const c of contas) map.set(c.id, Number(c.saldoInicial));
  for (const g of agg) {
    const cur = map.get(g.contaBancariaId) ?? 0;
    const v = Number(g._sum.valor ?? 0);
    map.set(g.contaBancariaId, g.tipo === "DESPESA" ? cur - v : cur + v);
  }
  return map;
}

export async function saldoConta(contaBancariaId: string): Promise<number> {
  const conta = await prisma.contaBancaria.findUnique({
    where: { id: contaBancariaId },
    select: { saldoInicial: true },
  });
  if (!conta) return 0;
  const agg = await prisma.lancamentoFinanceiro.groupBy({
    by: ["tipo"],
    where: { contaBancariaId },
    _sum: { valor: true },
  });
  let saldo = Number(conta.saldoInicial);
  for (const g of agg) {
    const v = Number(g._sum.valor ?? 0);
    saldo += g.tipo === "DESPESA" ? -v : v;
  }
  return saldo;
}
