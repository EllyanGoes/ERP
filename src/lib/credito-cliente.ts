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
 *
 * CLAIM ATÔMICO: cada vale é consumido com `updateMany` condicionado ao
 * valorUsado LIDO (compare-and-set) — dois PDVs concorrentes não gastam o mesmo
 * vale: quem perde a corrida relê o saldo e tenta o próximo/atualizado; se o
 * saldo real acabou, a função lança e a transação inteira faz rollback. O
 * pré-check de saldo do caller é só UX — a verdade é o claim daqui.
 */
export async function consumirCreditoCliente(tx: Tx, empresaId: string, clienteId: string, valor: number): Promise<number> {
  if (valor <= 0) return 0;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  let restante = round2(valor);

  // Poucas iterações bastam: cada rodada relê os vales e re-tenta os claims que
  // perderam a corrida. O limite evita loop infinito em contenção patológica.
  for (let rodada = 0; rodada < 5 && restante > 1e-6; rodada++) {
    const creditos = await tx.creditoCliente.findMany({
      where: { empresaId, clienteId, status: "ATIVO" },
      orderBy: { createdAt: "asc" },
      select: { id: true, valor: true, valorUsado: true },
    });
    if (creditos.length === 0) break;

    let progrediu = false;
    for (const c of creditos) {
      if (restante <= 1e-6) break;
      const saldo = round2(Number(c.valor) - Number(c.valorUsado));
      if (saldo <= 0) continue;
      const usar = Math.min(saldo, restante);
      const novoUsado = round2(Number(c.valorUsado) + usar);
      // Compare-and-set: só aplica se NINGUÉM mexeu no vale desde a leitura
      // (status ainda ATIVO e valorUsado inalterado). Sob concorrência, o
      // update bloqueia até a outra tx commitar e então re-avalia o WHERE —
      // count 0 = perdeu a corrida (o vale mudou), tenta na próxima rodada.
      const claimed = await tx.creditoCliente.updateMany({
        where: { id: c.id, status: "ATIVO", valorUsado: c.valorUsado },
        data: { valorUsado: novoUsado, status: novoUsado >= Number(c.valor) - 1e-6 ? "USADO" : "ATIVO" },
      });
      if (claimed.count === 1) {
        restante = round2(restante - usar);
        progrediu = true;
      }
    }
    if (!progrediu && restante > 1e-6) break; // nada claimável → saldo esgotou
  }

  if (restante > 1e-6) {
    const disponivel = await saldoCreditoCliente(tx, empresaId, clienteId);
    throw new Error(`Crédito insuficiente (saldo ${disponivel.toFixed(2)}, pedido ${round2(valor).toFixed(2)}).`);
  }
  return valor;
}
