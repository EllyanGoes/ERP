// MRP — explosão de necessidades a partir do Plano Mestre (MPS) e da Engenharia (BOM).
// v1: soma a demanda planejada por produto, explode os insumos da BOM e abate o saldo
// de estoque. UOM de planejamento assumida em milheiro (POR_MILHEIRO ×1; POR_UNIDADE ×1000;
// POR_PALETE ×1000/peças·palete do produto).
// Gross-up de perda por etapa fica como evolução (as perdas vivem no fluxo).

import { prisma } from "@/lib/prisma";
import { pecasPorPalete, baseFatorCusteioMilheiro } from "@/lib/pcp/unidades";

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
    include: {
      // Unidades do PRODUTO p/ saber peças/palete (insumos com base POR_PALETE).
      item: { select: { itemUnidades: { select: { fatorConversao: true, unidade: { select: { sigla: true } } } } } },
      insumos: { include: { insumoItem: { select: { codigo: true, descricao: true, itemUnidades: { select: { unidadeId: true, isPrincipal: true, fatorConversao: true } } } } } },
    },
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
    const ppp = pecasPorPalete(eng.item?.itemUnidades ?? []); // peças/palete do produto
    for (const ins of eng.insumos) {
      // Converte a quantidade da unidade da linha p/ a unidade-base do insumo.
      let fatorUnidade = 1;
      if (ins.unidadeId) {
        const iu = ins.insumoItem.itemUnidades.find((u) => u.unidadeId === ins.unidadeId);
        if (iu && !iu.isPrincipal && iu.fatorConversao != null) {
          const f = Number(iu.fatorConversao);
          if (Number.isFinite(f) && f > 0) fatorUnidade = f;
        }
      }
      // Demanda em milheiros → fator por milheiro (POR_UNIDADE ×1000; POR_PALETE 1000/pç·palete).
      const bruta = Number(ins.quantidade) * fatorUnidade * qtd * baseFatorCusteioMilheiro(ins.base, ppp);
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
