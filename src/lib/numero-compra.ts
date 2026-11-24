// ─────────────────────────────────────────────────────────────────────────────
// Número ÚNICO da compra (PC-0430).
//
// SC, CT, PC e DE do mesmo processo carregam o mesmo `numeroCompra`. Ele nasce
// no primeiro documento do processo, sai da sequência "PC" (a mesma do pedido,
// para nunca colidir com números de pedido antigos) e é herdado pelos seguintes.
// O pedido de compras usa o próprio número da compra como `numero`; na divisão
// rara (segundo pedido no mesmo processo) vira PC-0430/2, PC-0430/3…
// ─────────────────────────────────────────────────────────────────────────────
import type { Prisma } from "@prisma/client";
import { generateSimpleDocNumber } from "@/lib/utils";

type Tx = Prisma.TransactionClient;

export async function novoNumeroCompra(tx: Tx, empresaId: string): Promise<string> {
  const seq = await tx.sequencia.upsert({
    where: { empresaId_prefixo: { empresaId, prefixo: "PC" } },
    update: { ultimo: { increment: 1 } },
    create: { empresaId, prefixo: "PC", ultimo: 1 },
  });
  return generateSimpleDocNumber("PC", seq.ultimo);
}

/** Número da compra herdado da origem, ou um novo quando o processo começa aqui. */
export async function numeroCompraDaOrigem(
  tx: Tx,
  empresaId: string,
  origem: { necessidadeId?: string | null; cotacaoId?: string | null; pedidoId?: string | null },
): Promise<string> {
  if (origem.pedidoId) {
    const pc = await tx.pedidoCompra.findUnique({ where: { id: origem.pedidoId }, select: { numeroCompra: true } });
    if (pc?.numeroCompra) return pc.numeroCompra;
  }
  if (origem.cotacaoId) {
    const ct = await tx.cotacaoCompra.findUnique({
      where: { id: origem.cotacaoId },
      select: { numeroCompra: true, necessidade: { select: { numeroCompra: true } } },
    });
    const n = ct?.necessidade?.numeroCompra ?? ct?.numeroCompra;
    if (n) return n;
  }
  if (origem.necessidadeId) {
    const sc = await tx.necessidadeCompra.findUnique({ where: { id: origem.necessidadeId }, select: { numeroCompra: true } });
    if (sc?.numeroCompra) return sc.numeroCompra;
  }
  return novoNumeroCompra(tx, empresaId);
}

/** `numero` do pedido: o próprio número da compra, com /2, /3… se já houver pedido nele. */
export async function numeroDoPedido(tx: Tx, empresaId: string, numeroCompra: string): Promise<string> {
  const usados = await tx.pedidoCompra.findMany({
    where: { empresaId, OR: [{ numero: numeroCompra }, { numero: { startsWith: `${numeroCompra}/` } }] },
    select: { numero: true },
  });
  if (usados.length === 0) return numeroCompra;
  const ocupados = new Set(usados.map((u) => u.numero));
  let i = 2;
  while (ocupados.has(`${numeroCompra}/${i}`)) i++;
  return `${numeroCompra}/${i}`;
}
