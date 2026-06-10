// MRP — explosão de necessidades a partir do Plano Mestre (MPS) e da Engenharia (BOM).
// v1: soma a demanda planejada por produto, explode os insumos da BOM e abate o saldo
// de estoque. UOM de planejamento assumida em milheiro (POR_MILHEIRO ×1; POR_UNIDADE ×1000).
// Gross-up de perda por etapa fica como evolução (as perdas vivem no fluxo).

import type { BaseConsumo } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface NecessidadeMrp {
  insumoItemId: string;
  codigo: string;
  descricao: string;
  categoria: string;
  bruta: number;
  disponivel: number;
  liquida: number;
}
export interface SemEngenharia {
  itemId: string;
  descricao: string;
  quantidade: number;
}
export interface ResultadoMrp {
  necessidades: NecessidadeMrp[];
  semEngenharia: SemEngenharia[];
  produtosPlanejados: number;
}

function baseFator(base: BaseConsumo): number {
  // demanda assumida em milheiros
  switch (base) {
    case "POR_UNIDADE": return 1000;
    case "POR_MILHEIRO":
    case "POR_CICLO":
    case "POR_VAGAO":
    default:
      return 1;
  }
}
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export async function calcularMrp(periodo?: string): Promise<ResultadoMrp> {
  // 1. Demanda do MPS (opcionalmente filtrada por período), somada por produto
  const planos = await prisma.planoMestre.findMany({
    where: periodo ? { periodo } : undefined,
    include: { item: { select: { descricao: true } } },
  });
  const demandaPorProduto = new Map<string, { qtd: number; descricao: string }>();
  for (const p of planos) {
    const cur = demandaPorProduto.get(p.itemId) ?? { qtd: 0, descricao: p.item.descricao };
    cur.qtd += Number(p.quantidade);
    demandaPorProduto.set(p.itemId, cur);
  }

  // 2. Engenharias (BOM) dos produtos demandados
  const engs = await prisma.engenhariaProduto.findMany({
    where: { itemId: { in: Array.from(demandaPorProduto.keys()) } },
    include: { insumos: { include: { insumoItem: { select: { codigo: true, descricao: true } } } } },
  });
  const engByItem = new Map(engs.map((e) => [e.itemId, e]));

  const semEngenharia: SemEngenharia[] = [];
  const bruto = new Map<string, { codigo: string; descricao: string; categoria: string; bruta: number }>();

  for (const [itemId, { qtd, descricao }] of Array.from(demandaPorProduto)) {
    const eng = engByItem.get(itemId);
    if (!eng) {
      semEngenharia.push({ itemId, descricao, quantidade: r3(qtd) });
      continue;
    }
    for (const ins of eng.insumos) {
      const bruta = Number(ins.quantidade) * qtd * baseFator(ins.base);
      const cur = bruto.get(ins.insumoItemId) ?? {
        codigo: ins.insumoItem.codigo,
        descricao: ins.insumoItem.descricao,
        categoria: ins.categoria,
        bruta: 0,
      };
      cur.bruta += bruta;
      bruto.set(ins.insumoItemId, cur);
    }
  }

  // 3. Saldo disponível por insumo (soma entre locais)
  const insumoIds = Array.from(bruto.keys());
  const estoques = insumoIds.length
    ? await prisma.estoqueItem.groupBy({
        by: ["itemId"],
        where: { itemId: { in: insumoIds }, clienteDonoId: null },
        _sum: { quantidadeAtual: true },
      })
    : [];
  const dispByItem = new Map(estoques.map((e) => [e.itemId, Number(e._sum.quantidadeAtual ?? 0)]));

  // 4. Necessidade líquida
  const necessidades: NecessidadeMrp[] = insumoIds
    .map((id) => {
      const g = bruto.get(id)!;
      const disponivel = dispByItem.get(id) ?? 0;
      return {
        insumoItemId: id,
        codigo: g.codigo,
        descricao: g.descricao,
        categoria: g.categoria,
        bruta: r3(g.bruta),
        disponivel: r3(disponivel),
        liquida: r3(Math.max(g.bruta - disponivel, 0)),
      };
    })
    .sort((a, b) => b.liquida - a.liquida);

  return { necessidades, semEngenharia, produtosPlanejados: demandaPorProduto.size };
}
