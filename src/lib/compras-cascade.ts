import { Prisma } from "@prisma/client";
import { apagarLancamentosContabeis } from "@/lib/contabilidade";

/**
 * Erro lançado quando a cascata encontra Contas a Pagar já pagas (PAGA/PARCIAL
 * ou com baixa registrada): excluir o documento de origem deixaria um pagamento
 * real sem lastro. O handler mapeia para HTTP 409.
 */
export class ContaPagarComBaixaError extends Error {
  readonly numeros: string[];
  constructor(numeros: string[]) {
    super(
      `Não é possível excluir: ${numeros.length === 1 ? "o título" : "os títulos"} ` +
        `${numeros.join(", ")} já ${numeros.length === 1 ? "tem" : "têm"} pagamento registrado. ` +
        `Estorne a baixa no financeiro antes de excluir.`,
    );
    this.name = "ContaPagarComBaixaError";
    this.numeros = numeros;
  }
}

/**
 * Trata as Contas a Pagar dos pedidos de compra em exclusão:
 *  • se ALGUMA tem baixa (status PAGA/PARCIAL ou valorPago > 0) → lança
 *    ContaPagarComBaixaError (o caller responde 409 e a transação faz rollback);
 *  • senão apaga os lançamentos contábeis dos títulos (provisão COMPRA e
 *    eventuais PAGAMENTO órfãos) e deleta os títulos.
 *
 * Deve ser chamada DENTRO da transação, ANTES de deletar os pedidos.
 */
export async function tratarContasPagarDosPedidos(
  tx: Prisma.TransactionClient,
  pedidoIds: string[],
): Promise<void> {
  if (pedidoIds.length === 0) return;

  const cps = await tx.contaPagar.findMany({
    where: { pedidoCompraId: { in: pedidoIds } },
    select: { id: true, numero: true, status: true, valorPago: true },
  });
  if (cps.length === 0) return;

  const comBaixa = cps.filter(
    (cp) => cp.status === "PAGA" || cp.status === "PARCIAL" || Number(cp.valorPago) > 0,
  );
  if (comBaixa.length > 0) {
    throw new ContaPagarComBaixaError(comBaixa.map((cp) => cp.numero));
  }

  const cpIds = cps.map((cp) => cp.id);
  await apagarLancamentosContabeis(
    { origemTipo: { in: ["COMPRA", "PAGAMENTO"] }, origemId: { in: cpIds } },
    tx,
  );
  await tx.contaPagar.deleteMany({ where: { id: { in: cpIds } } });
}

/**
 * Reverte o estoque e exclui os Documentos de Entrada (ConferenciaCompra) informados.
 *
 * Usado na exclusão forçada (admin) de Cotação / Solicitação de Compras / Pedido:
 * ao remover os pedidos de compra, os documentos de entrada vinculados também são
 * apagados — e o estoque que eles lançaram precisa ser revertido para não
 * corromper os saldos.
 *
 * A reversão é feita a partir das MOVIMENTAÇÕES reais geradas pela NF
 * (MovimentacaoEstoque.conferenciaItemId): cada ENTRADA é subtraída do saldo do
 * local correspondente (com piso em 0), na EMPRESA dona da conferência. O preço
 * de custo médio (CMPM) NÃO é recalculado — é uma média ponderada histórica não
 * reversível de forma determinística.
 *
 * Os lançamentos contábeis da entrada (D Estoque / C Fornecedor, origemTipo
 * ESTOQUE_ENTRADA) também são apagados — dentro da MESMA transação, para não
 * deixar o razão inflado nem partidas órfãs.
 *
 * Deve ser chamada DENTRO de uma transação (recebe o tx client).
 */
export async function reverterEExcluirConferencias(
  tx: Prisma.TransactionClient,
  conferenciaIds: string[],
): Promise<void> {
  if (conferenciaIds.length === 0) return;

  const confs = await tx.conferenciaCompra.findMany({
    where: { id: { in: conferenciaIds } },
    select: { id: true, empresaId: true, itens: { select: { id: true } } },
  });

  for (const conf of confs) {
    const itemIds = conf.itens.map((i) => i.id);

    if (itemIds.length > 0) {
      const movs = await tx.movimentacaoEstoque.findMany({
        where: { conferenciaItemId: { in: itemIds } },
        select: { id: true, itemId: true, localEstoqueId: true, quantidade: true, tipo: true, clienteDonoId: true },
      });

      for (const m of movs) {
        // ENTRADA somou ao estoque → subtrai para reverter. (Conferência só gera ENTRADA.)
        const delta = m.tipo === "ENTRADA" ? -Number(m.quantidade) : Number(m.quantidade);
        const ei = await tx.estoqueItem.findFirst({
          // empresaId fixa o saldo na empresa DONA da conferência (modo grupo lê
          // várias empresas e (item, local) ficaria ambíguo sem o filtro).
          where: {
            empresaId: conf.empresaId,
            itemId: m.itemId,
            localEstoqueId: m.localEstoqueId,
            clienteDonoId: m.clienteDonoId ?? null,
          },
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

    // Contabilidade da entrada (D Estoque / C Fornecedor) — mesma transação.
    await apagarLancamentosContabeis(
      { empresaId: conf.empresaId, origemTipo: "ESTOQUE_ENTRADA", origemId: conf.id },
      tx,
    );
  }

  // Apaga os documentos de entrada (itens cascateiam).
  await tx.conferenciaCompra.deleteMany({ where: { id: { in: confs.map((c) => c.id) } } });
}
