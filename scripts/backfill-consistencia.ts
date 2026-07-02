/**
 * Backfill de consistência contábil/financeira (jul/2026) — roda o MOTOR TS
 * contra o banco do DATABASE_URL. Idempotente: `registrarLancamento`
 * re-sincroniza lançamentos existentes por (empresa, origemTipo, origemId);
 * re-rodar não duplica nada.
 *
 * Uso: npx tsx scripts/backfill-consistencia.ts [--dry]
 *
 * Passos:
 *  1) Reponta partidas históricas da conta 3.3.9004 (colisão de código) para as
 *     contas renumeradas: COMPENSACAO_AJUSTE → 3.3.9005 (Juros e Multas
 *     Passivos); BAIXA_IMOBILIZADO → 3.3.9006 (Perda na Baixa de Imobilizado).
 *     O que sobra em 3.3.9004 é Despesas Gerais legítima.
 *  2) Re-sincroniza TODOS os títulos (CR/CP) não cancelados — aplica o split de
 *     juros/multa em contas de resultado (o razonete do cliente/fornecedor
 *     passa a fechar no valor do título) e o arredondamento por partida.
 *  3) Re-sincroniza a perna de venda dos pedidos (D Clientes / C Material a
 *     Entregar) — modelo clássico, valores inalterados (no-op quando já certo).
 *  4) Devoluções existentes: revalora os movimentos de ENTRADA ao CUSTO atual
 *     (estavam a preço de venda), vincula os estornos em dinheiro por descrição
 *     (LancamentoFinanceiro.devolucaoId) e contabiliza (contabilizarDevolucao).
 *  5) Recomputa statusEntrega/statusFinanceiro de todos os pedidos de venda e
 *     o statusFinanceiro dos pedidos de compra.
 *
 * NÃO faz (deliberado): re-sync de minutas/conferências antigas (revaloraria
 * CMV/entradas históricas ao custo de HOJE) e re-execução de absorções passadas
 * (aplicarCmpmEmpresa não é idempotente — dobraria custo).
 */
import { prismaSemEscopo } from "../src/lib/prisma";
import {
  contabilizarTituloReceber,
  contabilizarTituloPagar,
  contabilizarVendaPedido,
  contabilizarDevolucao,
} from "../src/lib/contabilidade";
import { garantirContaJurosMultasPassivos, garantirContaPerdaBaixaImobilizado } from "../src/lib/conta-contabil";
import { recomputarStatusPedido, recomputarStatusFinanceiroCompra } from "../src/lib/pedido-totais";
import { valoresEstoqueDaEmpresa } from "../src/lib/valor-estoque";

const DRY = process.argv.includes("--dry");
const erros: string[] = [];
const log = (msg: string) => console.log(msg);
const guardar = (ctx: string) => (e: unknown) => {
  erros.push(`${ctx}: ${e instanceof Error ? e.message : String(e)}`);
  return null;
};

async function passo1_repontar9004() {
  const empresas = await prismaSemEscopo.empresa.findMany({ select: { id: true, razaoSocial: true } });
  for (const emp of empresas) {
    const c9004 = await prismaSemEscopo.contaContabil.findFirst({
      where: { empresaId: emp.id, codigo: "3.3.9004" }, select: { id: true },
    });
    if (!c9004) continue;
    const alvos: Array<{ origem: "COMPENSACAO_AJUSTE" | "BAIXA_IMOBILIZADO"; conta: () => Promise<{ id: string } | null> }> = [
      { origem: "COMPENSACAO_AJUSTE", conta: () => garantirContaJurosMultasPassivos(emp.id) },
      { origem: "BAIXA_IMOBILIZADO", conta: () => garantirContaPerdaBaixaImobilizado(emp.id) },
    ];
    for (const alvo of alvos) {
      const qtd = await prismaSemEscopo.partidaContabil.count({
        where: { contaId: c9004.id, lancamento: { origemTipo: alvo.origem } },
      });
      if (qtd === 0) continue;
      if (DRY) { log(`  [dry] ${emp.razaoSocial}: ${qtd} partida(s) ${alvo.origem} sairiam da 3.3.9004`); continue; }
      const destino = await alvo.conta();
      if (!destino) { erros.push(`${emp.razaoSocial}: conta destino de ${alvo.origem} não criada`); continue; }
      const r = await prismaSemEscopo.partidaContabil.updateMany({
        where: { contaId: c9004.id, lancamento: { origemTipo: alvo.origem } },
        data: { contaId: destino.id },
      });
      log(`  ${emp.razaoSocial}: ${r.count} partida(s) ${alvo.origem} repontada(s) da 3.3.9004`);
    }
  }
}

async function passo2_titulos() {
  const crs = await prismaSemEscopo.contaReceber.findMany({ where: { status: { not: "CANCELADA" } }, select: { id: true } });
  const cps = await prismaSemEscopo.contaPagar.findMany({ where: { status: { not: "CANCELADA" } }, select: { id: true } });
  log(`  ${crs.length} CR + ${cps.length} CP a re-sincronizar${DRY ? " [dry — pulado]" : ""}`);
  if (DRY) return;
  for (const cr of crs) await contabilizarTituloReceber(cr.id).catch(guardar(`CR ${cr.id}`));
  for (const cp of cps) await contabilizarTituloPagar(cp.id).catch(guardar(`CP ${cp.id}`));
}

async function passo3_pedidosVenda() {
  const pedidos = await prismaSemEscopo.pedidoVenda.findMany({
    where: { status: { in: ["CONFIRMADO", "EM_AGENDAMENTO", "CONCLUIDO"] }, intragrupo: false },
    select: { id: true },
  });
  log(`  ${pedidos.length} pedido(s) de venda${DRY ? " [dry — pulado]" : ""}`);
  if (DRY) return;
  for (const p of pedidos) await contabilizarVendaPedido(p.id).catch(guardar(`Pedido ${p.id}`));
}

async function passo4_devolucoes() {
  const devs = await prismaSemEscopo.devolucao.findMany({
    select: { id: true, empresaId: true, numero: true },
  });
  log(`  ${devs.length} devolução(ões)${DRY ? " [dry — pulado]" : ""}`);
  if (DRY) return;
  for (const dev of devs) {
    // Revalora as ENTRADAs da devolução ao custo ATUAL (melhor estimativa —
    // estavam a preço de venda) para o retorno reverter CPV/CMV pelo custo.
    const movs = await prismaSemEscopo.movimentacaoEstoque.findMany({
      where: { devolucaoId: dev.id, tipo: "ENTRADA" },
      select: { id: true, itemId: true },
    });
    if (movs.length) {
      const valores = await valoresEstoqueDaEmpresa(dev.empresaId, movs.map((m) => m.itemId));
      for (const m of movs) {
        const v = valores.get(m.itemId)?.valorUnitario ?? 0;
        if (v > 0) await prismaSemEscopo.movimentacaoEstoque.update({ where: { id: m.id }, data: { valorUnitario: v } });
      }
    }
    // Vincula estornos em dinheiro antigos (sem devolucaoId) pela descrição.
    await prismaSemEscopo.lancamentoFinanceiro.updateMany({
      where: { empresaId: dev.empresaId, tipo: "DESPESA", devolucaoId: null, descricao: { contains: dev.numero } },
      data: { devolucaoId: dev.id },
    });
    await contabilizarDevolucao(dev.id).catch(guardar(`Devolução ${dev.numero}`));
  }
}

async function passo5_recomputos() {
  const pvs = await prismaSemEscopo.pedidoVenda.findMany({ select: { id: true } });
  const pcs = await prismaSemEscopo.pedidoCompra.findMany({ select: { id: true } });
  log(`  ${pvs.length} pedido(s) de venda + ${pcs.length} de compra${DRY ? " [dry — pulado]" : ""}`);
  if (DRY) return;
  for (const p of pvs) await recomputarStatusPedido(prismaSemEscopo, p.id).catch(guardar(`recompute PV ${p.id}`));
  for (const p of pcs) await recomputarStatusFinanceiroCompra(prismaSemEscopo, p.id).catch(guardar(`recompute PC ${p.id}`));
}

async function main() {
  log(`Backfill de consistência ${DRY ? "(DRY RUN)" : ""} — banco: ${process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ":***@")}`);
  log("1) Repontando partidas da 3.3.9004 (colisão de código)…");
  await passo1_repontar9004();
  log("2) Re-sincronizando títulos (juros/multa em resultado)…");
  await passo2_titulos();
  log("3) Re-sincronizando perna de venda dos pedidos…");
  await passo3_pedidosVenda();
  log("4) Contabilizando devoluções existentes…");
  await passo4_devolucoes();
  log("5) Recomputando status de pedidos…");
  await passo5_recomputos();
  if (erros.length) {
    log(`\n⚠ ${erros.length} erro(s) — itens pulados (rodar de novo após corrigir):`);
    for (const e of erros) log(`  - ${e}`);
  } else {
    log("\n✓ Backfill concluído sem erros.");
  }
  await prismaSemEscopo.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
