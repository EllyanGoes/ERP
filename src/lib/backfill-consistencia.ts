import { prismaSemEscopo } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import {
  contabilizarTituloReceber,
  contabilizarTituloPagar,
  contabilizarVendaPedido,
  contabilizarDevolucao,
  recontabilizarConferencia,
  apagarLancamentosContabeis,
} from "@/lib/contabilidade";
import { garantirContaJurosMultasPassivos, garantirContaPerdaBaixaImobilizado } from "@/lib/conta-contabil";
import { recomputarStatusPedido, recomputarStatusFinanceiroCompra } from "@/lib/pedido-totais";
import { valoresEstoqueDaEmpresa } from "@/lib/valor-estoque";
import { encargosConferencia } from "@/lib/pedido-compra-de";

// Backfill de consistência contábil/financeira (jul/2026) — MOTOR TS, idempotente
// (`registrarLancamento` re-sincroniza por origem; re-rodar não duplica). Roda
// pelo script (scripts/backfill-consistencia.ts) contra o DATABASE_URL local, ou
// pelo endpoint admin (POST /api/contabilidade/backfill-consistencia) em prod.
//
// Passos: (1) reponta partidas históricas da 3.3.9004 (colisão de código);
// (2) re-sincroniza títulos CR/CP (split de juros/multa, arredondamento);
// (3) re-sincroniza a perna de venda dos pedidos; (4) contabiliza devoluções
// antigas (revalora a ENTRADA ao custo e vincula estornos em dinheiro);
// (5) recomputa status de pedidos; (6) re-sincroniza entradas de compra com
// frete/desconto (crédito do fornecedor vira o LÍQUIDO) e ajusta CPs abertas.
//
// NÃO faz (deliberado): re-sync de minutas antigas (revaloraria CMV histórico ao
// custo de hoje) e re-execução de absorções passadas (CMPM dobraria).

export type ResultadoBackfill = { log: string[]; erros: string[] };

// Faixas de % por passo (para a barra de progresso da UI). O peso reflete o
// volume típico: títulos e recomputos dominam o tempo.
const FAIXAS: Record<number, [number, number]> = {
  0: [0, 1], 1: [1, 2], 2: [2, 45], 3: [45, 55], 4: [55, 58], 5: [58, 82], 6: [82, 99],
};

export async function executarBackfillConsistencia(
  opts: { dry?: boolean; onProgress?: (pct: number, fase: string) => void } = {},
): Promise<ResultadoBackfill> {
  const DRY = opts.dry === true;
  const log: string[] = [];
  const erros: string[] = [];
  const guardar = (ctx: string) => (e: unknown) => {
    erros.push(`${ctx}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  };
  // Progresso dentro da faixa do passo: i de n itens processados.
  const tick = (passo: number, fase: string, i: number, n: number) => {
    const [ini, fim] = FAIXAS[passo];
    const pct = n > 0 ? ini + ((fim - ini) * i) / n : fim;
    opts.onProgress?.(Math.min(99, Math.round(pct)), fase);
  };

  // 0) Órfãos: partidas sem lançamento (lixo de deletes antigos, sem FK em
  // cascata) e lançamentos cujo DOCUMENTO de origem foi apagado (origemId sem
  // FK). Absorve o que o antigo botão "Gerar retroativos" fazia de único — com o
  // re-sync por origem dos passos seguintes, remover órfãos era a única parte do
  // "apagar e regravar" que ainda tinha valor. Órfão datado em exercício fechado
  // é recusado pelo guard e reportado (exige reabrir o exercício).
  tick(0, "Limpando órfãos", 0, 1);
  const orfaos = await prismaSemEscopo.$queryRaw<{ id: string }[]>`
    SELECT l.id FROM "LancamentoContabil" l WHERE l."origemId" IS NOT NULL AND (
      (l."origemTipo" = 'VENDA' AND NOT EXISTS (SELECT 1 FROM "PedidoVenda" d WHERE d.id = l."origemId") AND NOT EXISTS (SELECT 1 FROM "ContaReceber" d WHERE d.id = l."origemId"))
      OR (l."origemTipo" = 'RECEBIMENTO' AND NOT EXISTS (SELECT 1 FROM "ContaReceber" d WHERE d.id = l."origemId"))
      OR (l."origemTipo" IN ('COMPRA', 'PAGAMENTO') AND NOT EXISTS (SELECT 1 FROM "ContaPagar" d WHERE d.id = l."origemId"))
      OR (l."origemTipo" IN ('RECEITA_ENTREGA', 'ESTOQUE_SAIDA') AND NOT EXISTS (SELECT 1 FROM "Minuta" d WHERE d.id = l."origemId"))
      OR (l."origemTipo" = 'ESTOQUE_ENTRADA' AND NOT EXISTS (SELECT 1 FROM "ConferenciaCompra" d WHERE d.id = l."origemId"))
      OR (l."origemTipo" = 'DEVOLUCAO' AND NOT EXISTS (SELECT 1 FROM "Devolucao" d WHERE d.id = split_part(l."origemId", '#', 1)))
    )`;
  log.push(`0) Órfãos: ${orfaos.length} lançamento(s) de documento apagado${DRY ? " [dry]" : ""}`);
  if (!DRY) {
    const podres = await prismaSemEscopo.$executeRaw`DELETE FROM "PartidaContabil" p WHERE NOT EXISTS (SELECT 1 FROM "LancamentoContabil" l WHERE l.id = p."lancamentoId")`;
    if (Number(podres) > 0) log.push(`  ${podres} partida(s) órfã(s) removida(s)`);
    for (const o of orfaos) await apagarLancamentosContabeis({ id: o.id }).catch(guardar(`órfão ${o.id}`));
  }
  // Perna VENDA legada no nível da CR de PEDIDO: o modelo atual lança a venda no
  // PEDIDO (D Clientes / C Material a Entregar) e a CR só tem RECEBIMENTO — a
  // perna antiga na CR duplicava Clientes a Receber. Resíduo de compensação fica
  // (a perna dele é o reclass legítimo contra a transitória).
  const legadas = await prismaSemEscopo.$queryRaw<{ id: string }[]>`
    SELECT l.id FROM "LancamentoContabil" l
    JOIN "ContaReceber" cr ON cr.id = l."origemId" AND cr."pedidoVendaId" IS NOT NULL AND cr."compensacaoOrigemId" IS NULL
    WHERE l."origemTipo" = 'VENDA'`;
  if (legadas.length) log.push(`  ${legadas.length} perna(s) VENDA legada(s) em CR de pedido${DRY ? " [dry]" : ""}`);
  if (!DRY) for (const o of legadas) await apagarLancamentosContabeis({ id: o.id }).catch(guardar(`VENDA legada ${o.id}`));

  // 1) Colisão 3.3.9004 → reponta partidas por origem do lançamento.
  log.push("1) Repontando partidas da 3.3.9004 (colisão de código)…");
  tick(1, "Repontando 3.3.9004", 0, 1);
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
      if (DRY) { log.push(`  [dry] ${emp.razaoSocial}: ${qtd} partida(s) ${alvo.origem} sairiam da 3.3.9004`); continue; }
      const destino = await alvo.conta();
      if (!destino) { erros.push(`${emp.razaoSocial}: conta destino de ${alvo.origem} não criada`); continue; }
      const r = await prismaSemEscopo.partidaContabil.updateMany({
        where: { contaId: c9004.id, lancamento: { origemTipo: alvo.origem } },
        data: { contaId: destino.id },
      });
      log.push(`  ${emp.razaoSocial}: ${r.count} partida(s) ${alvo.origem} repontada(s)`);
    }
  }

  // 2) Títulos.
  const crs = await prismaSemEscopo.contaReceber.findMany({ where: { status: { not: "CANCELADA" } }, select: { id: true } });
  const cps = await prismaSemEscopo.contaPagar.findMany({ where: { status: { not: "CANCELADA" } }, select: { id: true } });
  log.push(`2) Re-sincronizando títulos: ${crs.length} CR + ${cps.length} CP${DRY ? " [dry — pulado]" : ""}`);
  if (!DRY) {
    const nTit = crs.length + cps.length;
    let iTit = 0;
    for (const cr of crs) { await contabilizarTituloReceber(cr.id).catch(guardar(`CR ${cr.id}`)); tick(2, "Re-sincronizando títulos", ++iTit, nTit); }
    for (const cp of cps) { await contabilizarTituloPagar(cp.id).catch(guardar(`CP ${cp.id}`)); tick(2, "Re-sincronizando títulos", ++iTit, nTit); }
  }

  // 3) Perna de venda dos pedidos.
  const pedidos = await prismaSemEscopo.pedidoVenda.findMany({
    where: { status: { in: ["CONFIRMADO", "EM_AGENDAMENTO", "CONCLUIDO"] }, intragrupo: false },
    select: { id: true },
  });
  log.push(`3) Perna de venda: ${pedidos.length} pedido(s)${DRY ? " [dry — pulado]" : ""}`);
  if (!DRY) {
    let iPed = 0;
    for (const p of pedidos) { await contabilizarVendaPedido(p.id).catch(guardar(`Pedido ${p.id}`)); tick(3, "Perna de venda dos pedidos", ++iPed, pedidos.length); }
  }

  // 4) Devoluções antigas.
  const devs = await prismaSemEscopo.devolucao.findMany({ select: { id: true, empresaId: true, numero: true } });
  log.push(`4) Devoluções: ${devs.length}${DRY ? " [dry — pulado]" : ""}`);
  if (!DRY) {
    for (const dev of devs) {
      const movs = await prismaSemEscopo.movimentacaoEstoque.findMany({
        where: { devolucaoId: dev.id, tipo: "ENTRADA" },
        select: { id: true, itemId: true },
      });
      if (movs.length) {
        // Revalora as ENTRADAs ao custo ATUAL (estavam a preço de venda).
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
      tick(4, "Devoluções", devs.indexOf(dev) + 1, devs.length);
    }
  }

  // 5) Recomputos.
  const pvs = await prismaSemEscopo.pedidoVenda.findMany({ select: { id: true } });
  const pcs = await prismaSemEscopo.pedidoCompra.findMany({ select: { id: true } });
  log.push(`5) Recomputando status: ${pvs.length} PV + ${pcs.length} PC${DRY ? " [dry — pulado]" : ""}`);
  if (!DRY) {
    const nRec = pvs.length + pcs.length;
    let iRec = 0;
    for (const p of pvs) { await recomputarStatusPedido(prismaSemEscopo, p.id).catch(guardar(`recompute PV ${p.id}`)); tick(5, "Recomputando status", ++iRec, nRec); }
    for (const p of pcs) { await recomputarStatusFinanceiroCompra(prismaSemEscopo, p.id).catch(guardar(`recompute PC ${p.id}`)); tick(5, "Recomputando status", ++iRec, nRec); }
  }

  // 6) Frete/desconto nas entradas de compra.
  const confs = await prismaSemEscopo.conferenciaCompra.findMany({
    where: {
      status: "CONCLUIDA",
      OR: [
        { frete: { gt: 0 } }, { desconto: { gt: 0 } },
        { pedido: { OR: [{ frete: { gt: 0 } }, { seguro: { gt: 0 } }, { despesas: { gt: 0 } }, { vrDesconto: { gt: 0 } }] } },
      ],
    },
    select: { id: true, numero: true, pedidoId: true },
  });
  log.push(`6) Entradas com frete/desconto: ${confs.length} conferência(s)${DRY ? " [dry — pulado]" : ""}`);
  if (!DRY) {
    const pedidosAjustar = new Set<string>();
    let iConf = 0;
    for (const c of confs) {
      await recontabilizarConferencia(c.id).catch(guardar(`Conferência ${c.numero}`));
      if (c.pedidoId) pedidosAjustar.add(c.pedidoId);
      tick(6, "Frete/desconto nas entradas", ++iConf, confs.length + 1);
    }
    // CPs ABERTAS sem baixa → líquido (proporcional por parcela; com baixa: manual).
    for (const pedidoId of Array.from(pedidosAjustar)) {
      const cpsPed = await prismaSemEscopo.contaPagar.findMany({
        where: { pedidoCompraId: pedidoId, status: { not: "CANCELADA" }, antecipado: false },
        select: { id: true, numero: true, valorOriginal: true, valorPago: true, status: true },
        orderBy: { numero: "asc" },
      });
      if (!cpsPed.length) continue;
      if (cpsPed.some((c) => decimalToNumber(c.valorPago) > 0)) {
        erros.push(`Pedido ${pedidoId}: CP com baixa — ajustar frete/desconto manualmente`);
        continue;
      }
      const confsPedido = await prismaSemEscopo.conferenciaCompra.findMany({
        where: { pedidoId, status: "CONCLUIDA" }, select: { id: true },
      });
      let liquido = 0;
      for (const cf of confsPedido) liquido += (await encargosConferencia(prismaSemEscopo, cf.id)).liquido;
      liquido = Math.round(liquido * 100) / 100;
      const atual = cpsPed.reduce((s, c) => s + decimalToNumber(c.valorOriginal), 0);
      if (liquido <= 0 || Math.abs(liquido - atual) <= 0.01) continue;
      let acc = 0;
      for (let i = 0; i < cpsPed.length; i++) {
        const v = i === cpsPed.length - 1
          ? Math.round((liquido - acc) * 100) / 100
          : Math.round((decimalToNumber(cpsPed[i].valorOriginal) / atual) * liquido * 100) / 100;
        acc = Math.round((acc + v) * 100) / 100;
        await prismaSemEscopo.contaPagar.update({ where: { id: cpsPed[i].id }, data: { valorOriginal: v } });
        await contabilizarTituloPagar(cpsPed[i].id).catch(guardar(`CP ${cpsPed[i].numero}`));
      }
      log.push(`  Pedido ${pedidoId}: CP(s) ajustada(s) ${atual.toFixed(2)} → ${liquido.toFixed(2)}`);
    }
  }

  return { log, erros };
}
