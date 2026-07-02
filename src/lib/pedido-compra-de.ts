import { Prisma } from "@prisma/client";
import { generateSimpleDocNumber } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Criação do Documento de Entrada (ConferenciaCompra) a partir de um Pedido de
// Compra — função ÚNICA usada pelos dois caminhos (POST /conferencias com
// pedidoId e PATCH /pedidos-compra/[id]/status → RECEBIDO). Antes existiam duas
// implementações divergentes: uma herdava unidadeId/TES/centro mas perdia os
// valores; a outra herdava valores mas perdia unidadeId/tesId/centroCustoId/
// compoeCusto — o que quebrava a conversão de unidade e o custo na conclusão.
// Aqui TODOS os campos da linha do pedido são copiados.
//
// Deve rodar DENTRO de uma transação (recebe o tx). A numeração usa a sequência
// "DE" da empresa dona do pedido (multiempresa).
// ─────────────────────────────────────────────────────────────────────────────
export async function criarConferenciaDePedido(
  tx: Prisma.TransactionClient,
  pedidoId: string,
  opts: { observacoes?: string | null } = {},
) {
  const pedido = await tx.pedidoCompra.findUnique({
    where: { id: pedidoId },
    include: { itens: { include: { tes: { select: { almoxarifadoDefaultId: true } } } } },
  });
  if (!pedido) throw new Error("Pedido não encontrado");

  const seq = await tx.sequencia.upsert({
    where: { empresaId_prefixo: { empresaId: pedido.empresaId, prefixo: "DE" } },
    create: { empresaId: pedido.empresaId, prefixo: "DE", ultimo: 1 },
    update: { ultimo: { increment: 1 } },
  });
  const numero = generateSimpleDocNumber("DE", seq.ultimo);

  return tx.conferenciaCompra.create({
    data: {
      numero,
      empresaId: pedido.empresaId,
      pedidoId,
      fornecedorId: pedido.fornecedorId ?? null,
      observacoes: opts.observacoes?.trim() || null,
      itens: {
        create: pedido.itens.map((i) => ({
          itemId: i.itemId,
          // Unidade da compra do pedido (conversão p/ base na conclusão).
          unidadeId: i.unidadeId ?? null,
          // Centro herdável/orçamentário (default editável na entrada).
          centroCustoId: i.centroCustoId ?? null,
          // TES + compõe-custo herdam para a entrada; o almoxarifado default do
          // TES vira o local da entrada (editável na conferência).
          tesId: i.tesId ?? null,
          compoeCusto: i.compoeCusto ?? null,
          localEstoqueId: i.tes?.almoxarifadoDefaultId ?? null,
          quantidadePedida: parseFloat(String(i.quantidade)),
          quantidadeRecebida: 0,
          // Valores do pedido (na unidade da compra) — base do CP e do custo.
          vlrUnitario: i.precoUnitario != null ? parseFloat(String(i.precoUnitario)) : null,
          vlrTotal: i.valorTotal != null ? parseFloat(String(i.valorTotal)) : null,
        })),
      },
    },
    include: {
      itens: { include: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } } } },
    },
  });
}
