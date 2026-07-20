import { Prisma } from "@prisma/client";
import { resolverLocaisSaida } from "@/lib/local-saida";
import { assertSaldoNaoNegativo, type ItemSaldoNegativo } from "@/lib/estoque-guard";

// Baixa de estoque de VENDA unificada. Substitui as cópias divergentes de
// balcão / entregar-balcão / concluir-com-saída / minutas, que ora esqueciam o
// local por item, ora o hard block de saldo negativo.

export type ItemBaixaVenda = {
  itemId: string;
  quantidade: number;
  pedidoVendaItemId?: string | null;
  unidadeId?: string | null; // unidade da linha (minuta) — carimbo informativo do movimento
  valorUnitario?: number | Prisma.Decimal | null;
  descricao?: string | null; // do item — usado na mensagem de saldo insuficiente
};

/**
 * Baixa cada item do SEU local de saída (categoria/saldo — `resolverLocaisSaida`),
 * aplica o hard block de saldo negativo ANTES de qualquer decremento
 * (`assertSaldoNaoNegativo` — linhas repetidas do mesmo item acumulam na projeção)
 * e cria os movimentos SAIDA com decremento atômico. Roda DENTRO da transação do
 * caller: o SaldoNegativoError aborta tudo e o handler responde 422 via
 * `respostaSaldoNegativo`.
 *
 * `permitirSaldoNegativo: true` pula o hard block (a venda é confirmada mesmo
 * deixando o estoque negativo — o front avisa o usuário e reenvia com o flag,
 * mesmo padrão do PCP). O saldo fica negativo até uma entrada/ajuste.
 */
export async function baixarEstoqueVenda(
  tx: Prisma.TransactionClient,
  opts: {
    empresaId: string;
    itens: ItemBaixaVenda[];
    fallbackLocalId: string | null;
    documento?: string | null;
    observacoes?: string | null;
    loteId?: string | null;
    permitirSaldoNegativo?: boolean;
  },
): Promise<void> {
  const { empresaId, itens, fallbackLocalId } = opts;
  if (itens.length === 0) return;

  const locaisPorItem = await resolverLocaisSaida(tx, empresaId, itens.map((i) => i.itemId), fallbackLocalId);
  const localDe = (itemId: string) => locaisPorItem.get(itemId) ?? fallbackLocalId;
  const chave = (itemId: string, localId: string) => `${itemId}|${localId}`;

  // Garante a linha de estoque de cada (item, local) e captura o saldo atual.
  const estoquePorChave = new Map<string, { id: string; saldo: number }>();
  const descricaoPorItem = new Map<string, string | null>();
  for (const it of itens) {
    const localId = localDe(it.itemId);
    if (!localId) throw new Error(`Item ${it.descricao ?? it.itemId} sem local de saída resolvível`);
    if (it.descricao) descricaoPorItem.set(it.itemId, it.descricao);
    const k = chave(it.itemId, localId);
    if (estoquePorChave.has(k)) continue;
    let estoque = await tx.estoqueItem.findFirst({
      where: { empresaId, itemId: it.itemId, localEstoqueId: localId, clienteDonoId: null },
      select: { id: true, quantidadeAtual: true },
    });
    if (!estoque) {
      estoque = await tx.estoqueItem.create({
        data: { empresaId, itemId: it.itemId, localEstoqueId: localId, quantidadeAtual: 0, quantidadeMin: 0, clienteDonoId: null },
        select: { id: true, quantidadeAtual: true },
      });
    }
    estoquePorChave.set(k, { id: estoque.id, saldo: parseFloat(String(estoque.quantidadeAtual)) });
  }

  // Projeta os saldos após TODAS as linhas e valida antes do primeiro decremento.
  const projetado = new Map<string, ItemSaldoNegativo>();
  for (const it of itens) {
    const k = chave(it.itemId, localDe(it.itemId)!);
    const est = estoquePorChave.get(k)!;
    const cur = projetado.get(k) ?? {
      itemId: it.itemId, descricao: descricaoPorItem.get(it.itemId) ?? null,
      saldoAtual: est.saldo, saldoDepois: est.saldo,
    };
    cur.saldoDepois -= it.quantidade;
    projetado.set(k, cur);
  }
  // Hard block, a menos que o caller autorize explicitamente o saldo negativo.
  if (!opts.permitirSaldoNegativo) assertSaldoNaoNegativo(Array.from(projetado.values()));

  // Decremento atômico + movimento por linha (saldo da linha deriva do pós-update).
  for (const it of itens) {
    const localId = localDe(it.itemId)!;
    const est = estoquePorChave.get(chave(it.itemId, localId))!;
    const atualizado = await tx.estoqueItem.update({
      where: { id: est.id },
      data: { quantidadeAtual: { decrement: it.quantidade } },
      select: { quantidadeAtual: true },
    });
    const saldoDepois = parseFloat(String(atualizado.quantidadeAtual));
    await tx.movimentacaoEstoque.create({
      data: {
        empresaId,
        itemId: it.itemId,
        localEstoqueId: localId,
        loteId: opts.loteId ?? null,
        pedidoVendaItemId: it.pedidoVendaItemId ?? null,
        unidadeId: it.unidadeId ?? null,
        tipo: "SAIDA",
        quantidade: it.quantidade,
        saldoAntes: saldoDepois + it.quantidade,
        saldoDepois,
        documento: opts.documento ?? null,
        observacoes: opts.observacoes ?? null,
        ...(it.valorUnitario != null ? { valorUnitario: it.valorUnitario } : {}),
      },
    });
  }
}
