import type { Prisma, EstadoWIP, StatusOrdemProducao } from "@prisma/client";
import { getOrCreateLocalProducao, getOrCreateLocalEstado, getOrCreateWipItem, getOrCreateLoteProducao, postMovimento, resolveLocalInsumo, getOrCreateLocalEmbalagemProducao } from "@/lib/pcp/wip-estoque";

// Local de onde um insumo é baixado: embalagem (palete/fita/grampo) sai do estoque
// de embalagem da PRODUÇÃO (liberado pelo almoxarife); os demais, do local com maior
// saldo. Assim a produção só consome a embalagem que foi liberada (saldo 0 → barra).
async function localDeConsumoInsumo(
  tx: Parameters<typeof resolveLocalInsumo>[0],
  itemId: string,
  categoriaEstoque: string | null | undefined,
): Promise<string> {
  if (categoriaEstoque === "EMBALAGEM") return getOrCreateLocalEmbalagemProducao(tx);
  return resolveLocalInsumo(tx, itemId);
}
import { custosDaEmpresa, custosParaApropriacao, aplicarCmpmEmpresa } from "@/lib/custo-empresa";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { registrarLancamento, contaPorCodigo, type PartidaIn } from "@/lib/contabilidade";
import { garantirContaLocalNaEmpresa } from "@/lib/conta-contabil";
import { pecasPorPalete, baseFatorConsumo } from "@/lib/pcp/unidades";

type Tx = Prisma.TransactionClient;

export type EtapaApontavel = {
  id: string;
  status: string;
  estadoSaida: EstadoWIP | null;
  sequencia: number;
  nome: string;
  subprodutoItemId: string | null;
};

export type ApontarEtapaInput = {
  ordemId: string;
  etapa: EtapaApontavel;
  upd: Prisma.ItemOrdemProducaoUpdateInput;
  concluindoAgora: boolean;
  qtdEntradaNum: number | null;
  qtdSaidaNum: number | null;
  biomassaKg: number | null;
  biomassaDescricao: string | null;
  milheiros: number | null;
  subprodutoQtd: number | null;
  apontadoPor: string | null;
  // Overrides p/ OP de uma área só (board de chão de fábrica): a OP não tem etapas
  // anteriores, então o estado de ENTRADA (WIP a consumir) e o estado da 1ª área do
  // fluxo (p/ saber se esta OP consome MP) vêm do fluxo, não das etapas da OP.
  // Ausentes (undefined) → deriva das etapas da própria OP (comportamento atual).
  fromEstadoOverride?: EstadoWIP | null;
  firstEstadoOverride?: EstadoWIP | null;
  // OP multi-produto: produz ESTE produto (chamado 1× por produto da OP). qtdSaidaNum
  // é a quantidade real desse produto (na unidade-base). Ausente → usa ordem.itemId.
  produtoOverride?: { itemId: string; codigo: string; descricao: string } | null;
};

/**
 * Aplica o apontamento de UMA etapa dentro de uma transação: atualiza a etapa,
 * registra biomassa, faz o consumo de insumos (BOM) + WIP do estado anterior, dá
 * entrada no destino (WIP/acabado) com o custo da fase, registra subproduto e
 * recalcula o status/estado da ordem. Extraído de /api/pcp/ordens/[id]/apontar
 * para ser reusado também pelo "Concluir produção" (apontamento em 1 clique).
 */
export async function apontarEtapaProducao(tx: Tx, p: ApontarEtapaInput): Promise<void> {
  const { ordemId, etapa, upd } = p;
  await tx.itemOrdemProducao.update({ where: { id: etapa.id }, data: upd });

  if (p.biomassaKg != null && p.biomassaKg > 0) {
    await tx.consumoBiomassa.create({
      data: {
        ordemProducaoId: ordemId,
        itemOrdemProducaoId: etapa.id,
        descricao: p.biomassaDescricao ?? "Caroço de açaí",
        quantidadeKg: p.biomassaKg,
        milheirosProduzidos: p.milheiros,
        registradoPor: p.apontadoPor,
      },
    });
  }

  const ordem = await tx.ordemProducao.findUnique({
    where: { id: ordemId },
    select: {
      status: true, numero: true, itemId: true, empresaId: true,
      item: { select: { codigo: true, descricao: true } },
      fluxoVersao: { select: { fluxo: { select: { nome: true } } } },
    },
  });
  if (!ordem || ordem.status === "CANCELADA") return;
  // Empresa da ORDEM (custeio/CMPM/numeração por empresa); padrão só como fallback.
  const empresaId = ordem.empresaId || EMPRESA_PADRAO_ID;

  const etapas = await tx.itemOrdemProducao.findMany({
    where: { ordemProducaoId: ordemId },
    select: { status: true, estadoSaida: true, sequencia: true },
    orderBy: { sequencia: "asc" },
  });

  // ── Movimentação + custeio por fase ──
  // Consome os insumos da etapa (MP) e o WIP do estado anterior, soma o custo e dá
  // entrada no WIP/acabado do estado de saída com o custo unitário acumulado.
  if (p.concluindoAgora && etapa.estadoSaida && p.qtdSaidaNum != null && p.qtdSaidaNum > 0) {
    // Produto desta produção: override (OP multi-produto, 1 chamada por produto) ou o itemId da OP.
    const itemIdAtivo = p.produtoOverride?.itemId ?? ordem.itemId;
    const base = p.produtoOverride
      ? { codigo: p.produtoOverride.codigo, descricao: p.produtoOverride.descricao }
      : ordem.item
        ? { codigo: ordem.item.codigo, descricao: ordem.item.descricao }
        : { codigo: ordem.numero, descricao: ordem.fluxoVersao?.fluxo?.nome ?? ordem.numero };
    const toEstado = etapa.estadoSaida;
    const anteriores = etapas.filter((e) => e.sequencia < etapa.sequencia && e.estadoSaida);
    // WIP de entrada: override (OP de área) ou derivado das etapas anteriores da OP.
    const fromEstado = p.fromEstadoOverride !== undefined
      ? p.fromEstadoOverride
      : (anteriores.length ? anteriores[anteriores.length - 1].estadoSaida : null);
    const loteId = await getOrCreateLoteProducao(tx, ordem.numero, `Produção ${ordem.numero} — ${etapa.nome}`, empresaId);
    const localDest = await getOrCreateLocalEstado(tx, toEstado);

    const qtdProduzida = p.qtdSaidaNum;
    const qtdConsumidaWip = p.qtdEntradaNum ?? p.qtdSaidaNum;
    // Estado da 1ª área do fluxo: override (OP de área) ou a 1ª etapa da OP. Só a OP
    // dessa 1ª área consome a MP (insumos da BOM com estadoConsumo null).
    const firstEstado = p.firstEstadoOverride !== undefined
      ? p.firstEstadoOverride
      : (etapas.find((e) => e.estadoSaida)?.estadoSaida ?? null);

    const destItemId =
      toEstado === "ACABADO" && itemIdAtivo ? itemIdAtivo : await getOrCreateWipItem(tx, base, toEstado);

    // 1. Consumo dos insumos da BOM cuja fase é esta etapa (custeio por fase).
    let custoInsumos = 0;
    const eng = itemIdAtivo
      ? await tx.engenhariaProduto.findUnique({
          where: { itemId: itemIdAtivo },
          include: {
            insumos: {
              include: {
                insumoItem: {
                  select: {
                    id: true, descricao: true, compoeCusto: true, precoCusto: true, categoriaEstoque: true,
                    itemUnidades: { select: { unidadeId: true, isPrincipal: true, fatorConversao: true } },
                  },
                },
              },
            },
          },
        })
      : null;
    const ppp = pecasPorPalete((itemIdAtivo
      ? (await tx.item.findUnique({ where: { id: itemIdAtivo }, select: { itemUnidades: { select: { fatorConversao: true, unidade: { select: { sigla: true } } } } } }))?.itemUnidades
      : null) ?? []); // peças/palete do produto (p/ POR_PALETE)
    const insumosDaFase = (eng?.insumos ?? []).filter((i) => (i.estadoConsumo ?? firstEstado) === toEstado);
    if (insumosDaFase.length) {
      const ids = Array.from(new Set(insumosDaFase.map((i) => i.insumoItemId)));
      const custos = await custosParaApropriacao(tx, empresaId, ids, `apontamento ${ordem.numero} — ${etapa.nome}`);
      for (const ins of insumosDaFase) {
        const meta = ins.insumoItem;
        if (!meta || meta.compoeCusto === false) continue; // água: não compõe custo nem saldo
        let fatorUnidade = 1;
        if (ins.unidadeId) {
          const iu = meta.itemUnidades.find((u) => u.unidadeId === ins.unidadeId);
          if (iu && !iu.isPrincipal && iu.fatorConversao != null) {
            const f = Number(iu.fatorConversao);
            if (Number.isFinite(f) && f > 0) fatorUnidade = f;
          }
        }
        const baseFator = baseFatorConsumo(ins.base, ppp);
        const consumo = Number(ins.quantidade) * fatorUnidade * baseFator * qtdProduzida;
        if (consumo <= 0) continue;
        const custoUnit = custos.get(ins.insumoItemId) ?? 0;
        const localIns = await localDeConsumoInsumo(tx, ins.insumoItemId, meta.categoriaEstoque);
        await postMovimento(tx, {
          itemId: ins.insumoItemId, localEstoqueId: localIns, tipo: "SAIDA", quantidade: consumo,
          ordemProducaoId: ordemId, documento: ordem.numero, observacoes: `Consumo ${meta.descricao} — ${etapa.nome}`,
          loteId, valorUnitario: custoUnit,
        });
        custoInsumos += consumo * custoUnit;
      }
    }

    // 2. Consumo do WIP do estado anterior (transfere o custo acumulado).
    let custoWipEntrada = 0;
    if (fromEstado) {
      const srcItemId = await getOrCreateWipItem(tx, base, fromEstado);
      const localFrom = await getOrCreateLocalEstado(tx, fromEstado);
      const custoWipFrom = (await custosDaEmpresa(tx, empresaId, [srcItemId])).get(srcItemId) ?? 0;
      await postMovimento(tx, {
        itemId: srcItemId, localEstoqueId: localFrom, tipo: "SAIDA", quantidade: qtdConsumidaWip,
        ordemProducaoId: ordemId, documento: ordem.numero, observacoes: `Consumo WIP ${fromEstado} — ${etapa.nome}`,
        loteId, valorUnitario: custoWipFrom,
      });
      custoWipEntrada = qtdConsumidaWip * custoWipFrom;
    }

    // 3. Entrada do destino com o custo unitário da fase (insumos + WIP anterior).
    const custoTotal = custoInsumos + custoWipEntrada;
    const custoUnitDest = qtdProduzida > 0 ? custoTotal / qtdProduzida : 0;
    await postMovimento(tx, {
      itemId: destItemId, localEstoqueId: localDest, tipo: "ENTRADA", quantidade: qtdProduzida,
      ordemProducaoId: ordemId, documento: ordem.numero, observacoes: `Produção ${toEstado} — ${etapa.nome}`,
      loteId, valorUnitario: custoUnitDest,
    });
    if (custoUnitDest > 0) {
      await aplicarCmpmEmpresa(tx, empresaId, destItemId, qtdProduzida, custoUnitDest, { incluirAcabado: true });
    }
  }

  // ── Subproduto/resíduo da etapa → entrada no estoque ──
  if (p.concluindoAgora && etapa.subprodutoItemId && p.subprodutoQtd != null && p.subprodutoQtd > 0) {
    const localId = await getOrCreateLocalProducao(tx);
    const loteId = await getOrCreateLoteProducao(tx, ordem.numero, `Subproduto ${etapa.nome} — ${ordem.numero}`, empresaId);
    await postMovimento(tx, {
      itemId: etapa.subprodutoItemId, localEstoqueId: localId, tipo: "ENTRADA", quantidade: p.subprodutoQtd,
      ordemProducaoId: ordemId, documento: ordem.numero, observacoes: `Subproduto/resíduo de ${etapa.nome}`, loteId,
    });
  }

  // ── Recalcula status/estado da ordem ──
  const todasConcluidas = etapas.length > 0 && etapas.every((e) => e.status === "CONCLUIDA");
  const algumaIniciada = etapas.some((e) => e.status !== "PENDENTE");
  const opData: { status?: StatusOrdemProducao; estadoAtual?: EstadoWIP } = {};
  if (todasConcluidas) opData.status = "CONCLUIDA";
  else if (algumaIniciada) opData.status = "EM_PRODUCAO";
  const concluidas = etapas.filter((e) => e.status === "CONCLUIDA");
  const ultima = concluidas[concluidas.length - 1];
  if (ultima?.estadoSaida) opData.estadoAtual = ultima.estadoSaida;
  if (Object.keys(opData).length) {
    await tx.ordemProducao.update({ where: { id: ordemId }, data: opData });
  }
}

/**
 * Apontamento de uma OP de área CIF (sem WIP) — ex.: "Mistura de insumos para
 * queima". Consome os insumos da engenharia (serragem) do estoque e lança o custo
 * direto em CIF a Apropriar: D 1.1.4.0001 CIF a Apropriar / C conta do local do
 * insumo. NÃO gera WIP/PA. Gatilho: o produto da OP tem naturezaPadrao com
 * destinoSugerido = CIF. Idempotente por (empresa, ESTOQUE_CONSUMO, CIF-MISTURA-<ordemId>).
 */
export async function apontarMisturaCif(tx: Tx, p: { ordemId: string; etapaId: string; qtd: number; apontadoPor: string | null }): Promise<void> {
  const agora = new Date();
  await tx.itemOrdemProducao.update({
    where: { id: p.etapaId },
    data: { status: "CONCLUIDA", qtdEntrada: p.qtd, qtdSaida: p.qtd, inicioReal: agora, fimReal: agora, ...(p.apontadoPor ? { apontadoPor: p.apontadoPor } : {}) },
  });

  const ordem = await tx.ordemProducao.findUnique({ where: { id: p.ordemId }, select: { numero: true, itemId: true, empresaId: true } });
  if (!ordem?.itemId) return;
  const empresaId = ordem.empresaId || EMPRESA_PADRAO_ID;

  const eng = await tx.engenhariaProduto.findUnique({
    where: { itemId: ordem.itemId },
    include: { insumos: { include: { insumoItem: { select: { id: true, descricao: true, compoeCusto: true, precoCusto: true, categoriaEstoque: true, itemUnidades: { select: { unidadeId: true, isPrincipal: true, fatorConversao: true } } } } } } },
  });
  const cifAprop = await contaPorCodigo(empresaId, "1.1.4.0001");
  if (eng && cifAprop) {
    const loteId = await getOrCreateLoteProducao(tx, ordem.numero, `Insumos de queima (CIF) ${ordem.numero}`, empresaId);
    const ppp = pecasPorPalete((await tx.item.findUnique({ where: { id: ordem.itemId }, select: { itemUnidades: { select: { fatorConversao: true, unidade: { select: { sigla: true } } } } } }))?.itemUnidades ?? []);
    // Custos em LOTE (antes do loop — sem N+1), com aviso quando cair no CMPM global.
    const idsInsumos = Array.from(new Set(eng.insumos.filter((i) => i.insumoItem?.compoeCusto !== false).map((i) => i.insumoItemId)));
    const custos = await custosParaApropriacao(tx, empresaId, idsInsumos, `mistura CIF ${ordem.numero}`);
    const custoPorConta = new Map<string, number>();
    for (const ins of eng.insumos) {
      const meta = ins.insumoItem;
      if (!meta || meta.compoeCusto === false) continue;
      let fator = 1;
      if (ins.unidadeId) {
        const iu = meta.itemUnidades.find((u) => u.unidadeId === ins.unidadeId);
        if (iu && !iu.isPrincipal && iu.fatorConversao != null) { const f = Number(iu.fatorConversao); if (Number.isFinite(f) && f > 0) fator = f; }
      }
      const baseFator = baseFatorConsumo(ins.base, ppp);
      const consumo = Number(ins.quantidade) * fator * baseFator * p.qtd;
      if (consumo <= 0) continue;
      const custoUnit = custos.get(ins.insumoItemId) ?? 0;
      const localIns = await localDeConsumoInsumo(tx, ins.insumoItemId, meta.categoriaEstoque);
      await postMovimento(tx, { itemId: ins.insumoItemId, localEstoqueId: localIns, tipo: "SAIDA", quantidade: consumo, ordemProducaoId: p.ordemId, documento: ordem.numero, observacoes: `Consumo ${meta.descricao} (CIF queima) — ${ordem.numero}`, loteId, valorUnitario: custoUnit });
      const cl = await garantirContaLocalNaEmpresa(empresaId, localIns);
      if (cl) custoPorConta.set(cl.id, Math.round(((custoPorConta.get(cl.id) ?? 0) + consumo * custoUnit) * 100) / 100);
    }
    // D CIF a Apropriar (total) / C conta de cada local do insumo. Débito = soma dos créditos (fecha).
    const creditos = Array.from(custoPorConta.entries()).filter(([, v]) => v > 0.005);
    const total = Math.round(creditos.reduce((s, [, v]) => s + v, 0) * 100) / 100;
    if (total > 0.005) {
      const partidas: PartidaIn[] = [{ contaId: cifAprop.id, tipo: "DEBITO", valor: total }];
      for (const [contaId, v] of creditos) partidas.push({ contaId, tipo: "CREDITO", valor: v });
      // Lançamento DENTRO da tx: não sobrevive a rollback do apontamento.
      await registrarLancamento({
        empresaId, data: agora,
        historico: `Consumo de insumos de queima (CIF) — ${ordem.numero}`,
        origemTipo: "ESTOQUE_CONSUMO", origemId: `CIF-MISTURA-${p.ordemId}`, partidas,
      }, tx);
    }
  }

  await tx.ordemProducao.update({ where: { id: p.ordemId }, data: { status: "CONCLUIDA" } });
}

/**
 * Apontamento de uma OP de área SEM estado de WIP que produz um PRODUTO específico
 * (produtoSaidaId), ex.: "Preparação" → "Mistura de Argila". Consome a BOM do
 * produto (argila/água) e dá ENTRADA do produto no estoque de produção (WIP), com o
 * custo acumulado. A contabilização (D estoque-produção / C estoque-insumo) é feita
 * por contabilizarProducaoOrdem. NÃO é CIF — é material direto (vira PEP no consumo).
 */
export async function apontarProducaoProduto(tx: Tx, p: { ordemId: string; etapaId: string; qtd: number; apontadoPor: string | null }): Promise<void> {
  const agora = new Date();
  await tx.itemOrdemProducao.update({
    where: { id: p.etapaId },
    data: { status: "CONCLUIDA", qtdEntrada: p.qtd, qtdSaida: p.qtd, inicioReal: agora, fimReal: agora, ...(p.apontadoPor ? { apontadoPor: p.apontadoPor } : {}) },
  });

  const ordem = await tx.ordemProducao.findUnique({ where: { id: p.ordemId }, select: { numero: true, itemId: true, empresaId: true } });
  if (ordem?.itemId) {
    const empresaId = ordem.empresaId || EMPRESA_PADRAO_ID;
    const eng = await tx.engenhariaProduto.findUnique({
      where: { itemId: ordem.itemId },
      include: { insumos: { include: { insumoItem: { select: { id: true, descricao: true, compoeCusto: true, precoCusto: true, categoriaEstoque: true, itemUnidades: { select: { unidadeId: true, isPrincipal: true, fatorConversao: true } } } } } } },
    });
    const loteId = await getOrCreateLoteProducao(tx, ordem.numero, `Produção ${ordem.numero}`, empresaId);
    const ppp = pecasPorPalete((await tx.item.findUnique({ where: { id: ordem.itemId }, select: { itemUnidades: { select: { fatorConversao: true, unidade: { select: { sigla: true } } } } } }))?.itemUnidades ?? []);
    // Custos em LOTE (antes do loop — sem N+1), com aviso quando cair no CMPM global.
    const idsInsumos = Array.from(new Set((eng?.insumos ?? []).filter((i) => i.insumoItem?.compoeCusto !== false).map((i) => i.insumoItemId)));
    const custos = await custosParaApropriacao(tx, empresaId, idsInsumos, `produção ${ordem.numero}`);
    let custoTotal = 0;
    for (const ins of eng?.insumos ?? []) {
      const meta = ins.insumoItem;
      if (!meta || meta.compoeCusto === false) continue; // água não compõe custo
      let fator = 1;
      if (ins.unidadeId) {
        const iu = meta.itemUnidades.find((u) => u.unidadeId === ins.unidadeId);
        if (iu && !iu.isPrincipal && iu.fatorConversao != null) { const f = Number(iu.fatorConversao); if (Number.isFinite(f) && f > 0) fator = f; }
      }
      const baseFator = baseFatorConsumo(ins.base, ppp);
      const consumo = Number(ins.quantidade) * fator * baseFator * p.qtd;
      if (consumo <= 0) continue;
      const custoUnit = custos.get(ins.insumoItemId) ?? 0;
      const localIns = await localDeConsumoInsumo(tx, ins.insumoItemId, meta.categoriaEstoque);
      await postMovimento(tx, { itemId: ins.insumoItemId, localEstoqueId: localIns, tipo: "SAIDA", quantidade: consumo, ordemProducaoId: p.ordemId, documento: ordem.numero, observacoes: `Consumo ${meta.descricao} — ${ordem.numero}`, loteId, valorUnitario: custoUnit });
      custoTotal += consumo * custoUnit;
    }
    // Entrada do produto no estoque de produção (WIP), valorado pelo custo consumido.
    const localDest = await getOrCreateLocalProducao(tx);
    const custoUnitDest = p.qtd > 0 ? custoTotal / p.qtd : 0;
    await postMovimento(tx, { itemId: ordem.itemId, localEstoqueId: localDest, tipo: "ENTRADA", quantidade: p.qtd, ordemProducaoId: p.ordemId, documento: ordem.numero, observacoes: `Produção ${ordem.numero}`, loteId, valorUnitario: custoUnitDest });
    if (custoUnitDest > 0) await aplicarCmpmEmpresa(tx, empresaId, ordem.itemId, p.qtd, custoUnitDest, { incluirAcabado: true });
  }

  await tx.ordemProducao.update({ where: { id: p.ordemId }, data: { status: "CONCLUIDA" } });
}
