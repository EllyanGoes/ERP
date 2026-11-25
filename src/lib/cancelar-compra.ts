// ─────────────────────────────────────────────────────────────────────────────
// Cancelamento no processo de compras (SC → CT → PC → DE).
//
// Dois jeitos, decididos por quem cancela:
//  • reabrirAposCancelarPedido — "cancelar só o pedido": a compra continua. A
//    cotação volta para análise (pode ser reenviada e gera PC-0430/2) e a SC
//    volta a EM_COTACAO. Sem isso a SC ficava "Em Pedido" sem pedido vivo,
//    parada no Fluxo de Compras (67 casos em prod em 24/11/2026).
//  • cancelarCompra — "cancelar a compra inteira": pedidos vivos cancelados,
//    cotação encerrada, aprovações pendentes resolvidas e SC CANCELADA com o
//    motivo (cotação aberta → CANCELADA). Bloqueia se já houve entrada ou título a pagar, que têm estorno
//    próprio (estoque/contábil/financeiro) e não podem sumir em cascata.
// As mudanças de status entram no CompraStatusLog pelos triggers do banco.
// ─────────────────────────────────────────────────────────────────────────────
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export class ErroCancelamento extends Error {}

const SC_TERMINAIS = ["CANCELADA", "TOTALMENTE_ATENDIDA", "REJEITADA"];

/** Depois de cancelar um pedido: reabre a cotação/SC se nada mais vivo atende a compra. */
export async function reabrirAposCancelarPedido(tx: Tx, pedidoId: string) {
  const pedido = await tx.pedidoCompra.findUnique({
    where: { id: pedidoId },
    select: { cotacaoId: true, necessidadeId: true, cotacao: { select: { status: true, necessidadeId: true } } },
  });
  if (!pedido) return;
  const scId = pedido.cotacao?.necessidadeId ?? pedido.necessidadeId;

  const outrosVivos = await tx.pedidoCompra.count({
    where: {
      id: { not: pedidoId },
      status: { not: "CANCELADO" },
      OR: [
        ...(pedido.cotacaoId ? [{ cotacaoId: pedido.cotacaoId }] : []),
        ...(scId ? [{ necessidadeId: scId }, { cotacao: { necessidadeId: scId } }] : []),
      ],
    },
  });
  if (outrosVivos > 0) return;

  let cotacaoReaberta = false;
  if (pedido.cotacaoId && pedido.cotacao?.status === "CONCLUIDA") {
    await tx.cotacaoCompra.update({ where: { id: pedido.cotacaoId }, data: { status: "EM_ANALISE" } });
    cotacaoReaberta = true;
  }
  if (scId) {
    const sc = await tx.necessidadeCompra.findUnique({ where: { id: scId }, select: { status: true } });
    if (sc && (sc.status === "EM_PEDIDO" || sc.status === "EM_COTACAO")) {
      const novo = cotacaoReaberta || pedido.cotacaoId ? "EM_COTACAO" : "APROVADA";
      if (novo !== sc.status) await tx.necessidadeCompra.update({ where: { id: scId }, data: { status: novo } });
    }
  }
}

/** Cancela a compra inteira pelo número (PC-0430) dentro da empresa. */
export async function cancelarCompra(
  tx: Tx,
  { empresaId, numeroCompra, motivo }: { empresaId: string; numeroCompra: string; motivo: string },
) {
  const where = { empresaId, numeroCompra };
  const [scs, cts, pcs, des] = await Promise.all([
    tx.necessidadeCompra.findMany({ where, select: { id: true, numero: true, status: true } }),
    tx.cotacaoCompra.findMany({ where, select: { id: true, status: true } }),
    tx.pedidoCompra.findMany({
      where,
      select: {
        id: true, numero: true, status: true,
        contasPagar: { where: { status: { not: "CANCELADA" } }, select: { numero: true } },
      },
    }),
    tx.conferenciaCompra.findMany({ where, select: { numero: true } }),
  ]);

  if (scs.length + cts.length + pcs.length + des.length === 0) {
    throw new ErroCancelamento(`Compra ${numeroCompra} não encontrada.`);
  }
  if (des.length > 0) {
    throw new ErroCancelamento(
      `Esta compra já tem entrada (${des.map((d) => d.numero).join(", ")}). Exclua ou estorne a entrada antes de cancelar a compra.`,
    );
  }
  const recebido = pcs.find((p) => p.status === "RECEBIDO");
  if (recebido) throw new ErroCancelamento(`O pedido ${recebido.numero} já foi recebido; a compra não pode ser cancelada.`);
  const titulos = pcs.flatMap((p) => p.contasPagar.map((c) => c.numero));
  if (titulos.length > 0) {
    throw new ErroCancelamento(
      `Há título a pagar ligado ao pedido (${titulos.join(", ")}). Cancele-o no Contas a Pagar antes de cancelar a compra.`,
    );
  }

  const observacao = `Compra cancelada — ${motivo}`;
  const pcIds = pcs.map((p) => p.id);
  const ctIds = cts.map((c) => c.id);
  const scIds = scs.map((s) => s.id);

  await tx.pedidoCompra.updateMany({ where: { id: { in: pcIds }, status: { not: "CANCELADO" } }, data: { status: "CANCELADO" } });
  // Cotação ainda aberta vira CANCELADA (a já concluída fica como está: gerou pedido).
  await tx.cotacaoCompra.updateMany({ where: { id: { in: ctIds }, status: { notIn: ["CONCLUIDA", "CANCELADA"] } }, data: { status: "CANCELADA" } });
  await tx.aprovacaoSC.updateMany({
    where: {
      status: "PENDENTE",
      OR: [{ necessidadeId: { in: scIds } }, { cotacaoId: { in: ctIds } }, { pedidoCompraId: { in: pcIds } }],
    },
    data: { status: "REPROVADO", respondidoEm: new Date(), observacao },
  });
  await tx.necessidadeCompra.updateMany({
    where: { id: { in: scIds }, status: { notIn: SC_TERMINAIS as never } },
    data: { status: "CANCELADA", motivoCancelamento: motivo, dataCancelamento: new Date() },
  });

  return { pedidos: pcIds.length, cotacoes: ctIds.length, solicitacoes: scIds.length };
}
