export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recalcularSaldos } from "@/lib/estoque-saldos";
import { apagarLancamentosContabeis } from "@/lib/contabilidade";
import { zerarCustoEmpresaSeSemEstoque } from "@/lib/custo-empresa";
import { assertSaldoNaoNegativo, respostaSaldoNegativo, SaldoNegativoError, type ItemSaldoNegativo } from "@/lib/estoque-guard";

// POST — Estorna o apontamento de uma ordem de produção: desfaz TUDO que o
// apontamento gerou (estoque, movimentos, biomassa, contábil) e devolve a OP/etapas
// para o estado pré-apontamento, liberando-a para reapontamento ou exclusão.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const ordem = await prisma.ordemProducao.findUnique({
    where: { id: params.id },
    select: { id: true, empresaId: true },
  });
  if (!ordem) return NextResponse.json({ error: "Ordem não encontrada" }, { status: 404 });

  const num = (d: unknown) => parseFloat(String(d));
  try {
  await prisma.$transaction(async (tx) => {
    // 1) Movimentos da OP (consumo de MP/WIP e produção): reverte o saldo por
    //    tipo (ENTRADA → decrement; SAIDA → +; AJUSTE → delta) e apaga.
    const movs = await tx.movimentacaoEstoque.findMany({
      where: { ordemProducaoId: params.id },
      select: { id: true, itemId: true, localEstoqueId: true, tipo: true, quantidade: true, saldoAntes: true, saldoDepois: true, clienteDonoId: true, loteId: true },
    });

    // Guard de saldo ANTES de mexer: se desfazer as ENTRADAS deixaria algum item
    // com saldo negativo (ex.: PA da OP já vendido), aborta com 422.
    const efeitoPorChave = new Map<string, number>();
    for (const m of movs) {
      if (!m.localEstoqueId) continue;
      const efeito = m.tipo === "ENTRADA" ? num(m.quantidade) : m.tipo === "SAIDA" ? -num(m.quantidade) : num(m.saldoDepois) - num(m.saldoAntes);
      const chave = `${m.itemId}|${m.localEstoqueId}|${m.clienteDonoId ?? ""}`;
      efeitoPorChave.set(chave, (efeitoPorChave.get(chave) ?? 0) + efeito);
    }
    const negativos: ItemSaldoNegativo[] = [];
    for (const [chave, efeito] of Array.from(efeitoPorChave.entries())) {
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
      await zerarCustoEmpresaSeSemEstoque(tx, ordem.empresaId, itemId);
    }
    for (const loteId of Array.from(lotes)) {
      const restante = await tx.movimentacaoEstoque.count({ where: { loteId } });
      if (restante === 0) await tx.loteMovimentacao.delete({ where: { id: loteId } }).catch(() => {});
    }

    // 2) Biomassa apontada.
    await tx.consumoBiomassa.deleteMany({ where: { ordemProducaoId: params.id } });

    // 3) Reset das etapas e da OP para o estado pré-apontamento.
    await tx.itemOrdemProducao.updateMany({
      where: { ordemProducaoId: params.id },
      data: { status: "PENDENTE", qtdEntrada: null, qtdSaida: null, qtdPerda: null, vagoes: null, vagonetas: null, inicioReal: null, fimReal: null },
    });
    await tx.ordemProducao.update({ where: { id: params.id }, data: { status: "LIBERADA", estadoAtual: "UMIDO" } });

    // 4) Contábil DENTRO da transação (atômico): produção (transferência entre
    // contas de estoque) + CIF de mistura. Se falhar, o estorno todo faz rollback.
    await apagarLancamentosContabeis({ empresaId: ordem.empresaId, origemTipo: "ESTOQUE_PRODUCAO", origemId: params.id }, tx);
    await apagarLancamentosContabeis({ empresaId: ordem.empresaId, origemTipo: "ESTOQUE_CONSUMO", origemId: `CIF-MISTURA-${params.id}` }, tx);
  });
  } catch (e) {
    if (e instanceof SaldoNegativoError) return respostaSaldoNegativo(e);
    throw e;
  }

  return NextResponse.json({ ok: true });
}
