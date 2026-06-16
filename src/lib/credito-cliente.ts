import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Saldo de crédito ATIVO do cliente na empresa (Σ valor − valorUsado). */
export async function saldoCreditoCliente(client: Tx, empresaId: string, clienteId: string): Promise<number> {
  const creditos = await client.creditoCliente.findMany({
    where: { empresaId, clienteId, status: "ATIVO" },
    select: { valor: true, valorUsado: true },
  });
  return creditos.reduce((s, c) => s + (Number(c.valor) - Number(c.valorUsado)), 0);
}

/**
 * Consome (FIFO) `valor` do crédito ATIVO do cliente, incrementando valorUsado e
 * marcando USADO quando esgotado. Lança se o saldo for insuficiente. Deve rodar
 * dentro de uma transação. Retorna o total consumido (= valor).
 */
export async function consumirCreditoCliente(tx: Tx, empresaId: string, clienteId: string, valor: number): Promise<number> {
  if (valor <= 0) return 0;
  const creditos = await tx.creditoCliente.findMany({
    where: { empresaId, clienteId, status: "ATIVO" },
    orderBy: { createdAt: "asc" },
    select: { id: true, valor: true, valorUsado: true },
  });
  let restante = Math.round(valor * 100) / 100;
  const disponivel = creditos.reduce((s, c) => s + (Number(c.valor) - Number(c.valorUsado)), 0);
  if (restante > disponivel + 1e-6) {
    throw new Error(`Crédito insuficiente (saldo ${disponivel.toFixed(2)}, pedido ${restante.toFixed(2)}).`);
  }
  for (const c of creditos) {
    if (restante <= 1e-6) break;
    const saldo = Number(c.valor) - Number(c.valorUsado);
    if (saldo <= 0) continue;
    const usar = Math.min(saldo, restante);
    const novoUsado = Math.round((Number(c.valorUsado) + usar) * 100) / 100;
    await tx.creditoCliente.update({
      where: { id: c.id },
      data: { valorUsado: novoUsado, status: novoUsado >= Number(c.valor) - 1e-6 ? "USADO" : "ATIVO" },
    });
    restante = Math.round((restante - usar) * 100) / 100;
  }
  return valor;
}
