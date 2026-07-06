import type { Prisma } from "@prisma/client";
import { recalcularSaldos } from "@/lib/estoque-saldos";
import { apagarLancamentosContabeis } from "@/lib/contabilidade";
import { zerarCustoEmpresaSeSemEstoque } from "@/lib/custo-empresa";
import { assertSaldoNaoNegativo, type ItemSaldoNegativo } from "@/lib/estoque-guard";

type Tx = Prisma.TransactionClient;

/**
 * Estorna o apontamento de uma ordem de produção DENTRO de uma transação: desfaz
 * TUDO que o apontamento gerou (estoque, movimentos, biomassa, custo-empresa,
 * contábil) e devolve a OP/etapas ao estado pré-apontamento, liberando-a para
 * reapontamento, edição ou exclusão. Lança SaldoNegativoError se desfazer as
 * ENTRADAS deixaria algum saldo negativo (ex.: PA da OP já vendido) — a menos
 * que `permitirSaldoNegativo` (usuário confirmou no front, mesmo fluxo do
 * apontamento; essencial p/ limpar OPs erradas quando o saldo JÁ está negativo).
 * Usada pela rota de estorno e pela EDIÇÃO/EXCLUSÃO de OP já apontada.
 */
export async function estornarApontamentoOrdem(tx: Tx, p: { ordemId: string; empresaId: string; permitirSaldoNegativo?: boolean }): Promise<void> {
  const num = (d: unknown) => parseFloat(String(d));

  // 1) Movimentos da OP (consumo de MP/WIP e produção): reverte o saldo por
  //    tipo (ENTRADA → decrement; SAIDA → +; AJUSTE → delta) e apaga.
  const movs = await tx.movimentacaoEstoque.findMany({
    where: { ordemProducaoId: p.ordemId },
    select: { id: true, itemId: true, localEstoqueId: true, tipo: true, quantidade: true, saldoAntes: true, saldoDepois: true, clienteDonoId: true, loteId: true },
  });

  // Guard de saldo ANTES de mexer: se desfazer as ENTRADAS deixaria algum item
  // com saldo negativo (ex.: PA da OP já vendido), aborta.
  const efeitoPorChave = new Map<string, number>();
  for (const m of movs) {
    if (!m.localEstoqueId) continue;
    const efeito = m.tipo === "ENTRADA" ? num(m.quantidade) : m.tipo === "SAIDA" ? -num(m.quantidade) : num(m.saldoDepois) - num(m.saldoAntes);
    const chave = `${m.itemId}|${m.localEstoqueId}|${m.clienteDonoId ?? ""}`;
    efeitoPorChave.set(chave, (efeitoPorChave.get(chave) ?? 0) + efeito);
  }
  const negativos: ItemSaldoNegativo[] = [];
  for (const [chave, efeito] of Array.from(efeitoPorChave.entries())) {
    if (p.permitirSaldoNegativo) break;
    if (efeito <= 0) continue; // estorno só reduz saldo onde a OP deu ENTRADA líquida
    const [itemId, localId, dono] = chave.split("|");
    const est = await tx.estoqueItem.findFirst({
      where: { itemId, localEstoqueId: localId, clienteDonoId: dono || null },
      select: { quantidadeAtual: true },
    });
    const saldoAtual = num(est?.quantidadeAtual ?? 0) || 0;
    const saldoDepois = saldoAtual - efeito;
    if (saldoDepois < -1e-9) {
      const item = await tx.item.findUnique({ where: { id: itemId }, select: { descricao: true } });
      negativos.push({ itemId, descricao: item?.descricao ?? null, saldoAtual, saldoDepois });
    }
  }
  assertSaldoNaoNegativo(negativos);

  const afetados = new Set<string>();
  const lotes = new Set<string>();
  for (const m of movs) {
    if (m.loteId) lotes.add(m.loteId);
    if (!m.localEstoqueId) continue;
    const efeito = m.tipo === "ENTRADA" ? num(m.quantidade) : m.tipo === "SAIDA" ? -num(m.quantidade) : num(m.saldoDepois) - num(m.saldoAntes);
    if (efeito !== 0) {
      await tx.estoqueItem.updateMany({
        where: { itemId: m.itemId, localEstoqueId: m.localEstoqueId, clienteDonoId: m.clienteDonoId ?? null },
        data: { quantidadeAtual: { decrement: efeito } },
      });
    }
    afetados.add(`${m.itemId}|${m.localEstoqueId}|${m.clienteDonoId ?? ""}`);
  }
  if (movs.length) await tx.movimentacaoEstoque.deleteMany({ where: { id: { in: movs.map((m) => m.id) } } });
  for (const chave of Array.from(afetados)) {
    const [itemId, localId, dono] = chave.split("|");
    await recalcularSaldos(tx, itemId, localId, dono || null);
  }

  // Custo-empresa aplicado pelo apontamento (aplicarCmpmEmpresa nas ENTRADAS de
  // WIP/acabado): zera o custo dos itens que a OP produziu quando o estoque da
  // empresa zerou junto com o estorno (precedente: exclusão de entrada de compra).
  const itensProduzidos = Array.from(new Set(movs.filter((m) => m.tipo === "ENTRADA").map((m) => m.itemId)));
  for (const itemId of itensProduzidos) {
    await zerarCustoEmpresaSeSemEstoque(tx, p.empresaId, itemId);
  }
  for (const loteId of Array.from(lotes)) {
    const restante = await tx.movimentacaoEstoque.count({ where: { loteId } });
    if (restante === 0) await tx.loteMovimentacao.delete({ where: { id: loteId } }).catch(() => {});
  }

  // 2) Biomassa apontada.
  await tx.consumoBiomassa.deleteMany({ where: { ordemProducaoId: p.ordemId } });

  // 3) Reset das etapas, dos reais por produto e da OP para o estado pré-apontamento.
  await tx.itemOrdemProducao.updateMany({
    where: { ordemProducaoId: p.ordemId },
    data: { status: "PENDENTE", qtdEntrada: null, qtdSaida: null, qtdPerda: null, vagoes: null, vagonetas: null, inicioReal: null, fimReal: null },
  });
  await tx.ordemProducaoProdutoItem.updateMany({
    where: { ordemProducaoId: p.ordemId },
    data: { quantidadeReal: null, qtdPerda: null },
  });
  await tx.ordemProducao.update({ where: { id: p.ordemId }, data: { status: "LIBERADA", estadoAtual: "UMIDO" } });

  // 4) Contábil DENTRO da transação (atômico): produção (transferência entre
  // contas de estoque) + CIF de mistura. Se falhar, o estorno todo faz rollback.
  await apagarLancamentosContabeis({ empresaId: p.empresaId, origemTipo: "ESTOQUE_PRODUCAO", origemId: p.ordemId }, tx);
  await apagarLancamentosContabeis({ empresaId: p.empresaId, origemTipo: "ESTOQUE_CONSUMO", origemId: `CIF-MISTURA-${p.ordemId}` }, tx);
}
