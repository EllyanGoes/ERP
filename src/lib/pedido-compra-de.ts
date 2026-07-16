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

/**
 * Encargos e desconto do DOCUMENTO de entrada, para compor a dívida LÍQUIDA com
 * o fornecedor: líquido = itens recebidos − desconto + frete/seguro/despesas.
 * Fonte: os campos da própria conferência (frete/desconto digitados no DE);
 * quando vazios, rateia os do PEDIDO pela fração recebida em valor (recebimento
 * parcial rateia os encargos proporcionalmente). `base` = Σ recebido × vlrUnitario
 * (mesma grandeza monetária dos movimentos de entrada, independentemente da
 * unidade — qtd×fator e preço÷fator se cancelam).
 */
export async function encargosConferencia(
  db: Pick<Prisma.TransactionClient, "conferenciaCompra">,
  conferenciaId: string,
): Promise<{ base: number; encargos: number; desconto: number; liquido: number }> {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const num = (d: unknown) => (d == null ? 0 : parseFloat(String(d)) || 0);
  const conf = await db.conferenciaCompra.findUnique({
    where: { id: conferenciaId },
    select: {
      frete: true, desconto: true,
      itens: { select: { quantidadeRecebida: true, vlrUnitario: true, vlrTotal: true, desconto: true } },
      pedido: { select: { frete: true, seguro: true, despesas: true, vrDesconto: true, itens: { select: { valorTotal: true } } } },
    },
  });
  if (!conf) return { base: 0, encargos: 0, desconto: 0, liquido: 0 };
  // Base = Σ vlrTotal da LINHA conferida (valor EXATO confirmado no DE). Recompor
  // qtd × vlrUnitario perdia dinheiro duas vezes: o unitário persistido é
  // arredondado a 2 casas (preço real pode ter 3-4, ex.: 2,282 → 2,28; PC-0117
  // nascia 58,40 em vez de 58,46) e o desconto % da linha era ignorado.
  // Fallback (linha antiga sem vlrTotal): qtd × unitário × (1 − desconto%).
  const base = r2(conf.itens.reduce((s, it) => {
    if (it.vlrTotal != null) return s + num(it.vlrTotal);
    const pct = num(it.desconto);
    return s + num(it.quantidadeRecebida) * num(it.vlrUnitario) * (1 - (pct > 0 ? pct / 100 : 0));
  }, 0));
  let encargos = r2(num(conf.frete));
  let desconto = r2(num(conf.desconto));
  if (encargos <= 0 && desconto <= 0 && conf.pedido) {
    const subtotalPedido = conf.pedido.itens.reduce((s, it) => s + num(it.valorTotal), 0);
    const frac = subtotalPedido > 0 ? Math.min(base / subtotalPedido, 1) : 0;
    encargos = r2((num(conf.pedido.frete) + num(conf.pedido.seguro) + num(conf.pedido.despesas)) * frac);
    desconto = r2(num(conf.pedido.vrDesconto) * frac);
  }
  return { base, encargos, desconto, liquido: r2(base - desconto + encargos) };
}
