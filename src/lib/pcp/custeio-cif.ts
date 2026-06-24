// Custeio: deriva a taxa predeterminada de CIF e MOD por milheiro a partir dos
// parâmetros (biomassa/energia/combustível/folha) e do volume produzido (entradas
// manuais no estoque de produto acabado). Calcula o custo de cada produto =
// material (BOM × CMPM) + MOD + CIF, para valorar o estoque de acabado.

import { prismaSemEscopo } from "@/lib/prisma";
import { custosDaEmpresa } from "@/lib/custo-empresa";

const num = (v: unknown): number => {
  if (v == null) return 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export interface CusteioProduto {
  itemId: string;
  codigo: string;
  descricao: string;
  volumeUn: number;
  volumeMilheiros: number;
  materialMilheiro: number;
  modMilheiro: number;
  cifMilheiro: number;
  custoMilheiro: number;
  custoUnitario: number; // custo por unidade (base do item) = custoMilheiro / 1000
}

export interface CusteioResult {
  competencia: string;
  params: { biomassaDia: number; energiaMes: number; combustivelDia: number; folhaMes: number; diasTrabalhados: number } | null;
  biomassaMes: number;
  combustivelMes: number;
  energiaMes: number;
  cifPoolMes: number;
  folhaMes: number;
  volumeTotalMilheiros: number;
  cifRate: number; // R$/milheiro (predeterminada)
  modRate: number; // R$/milheiro
  produtos: CusteioProduto[];
}

/** Custo de material (R$/milheiro) de um produto pela engenharia × CMPM (ignora compoeCusto=false). */
async function materialPorMilheiro(empresaId: string, eng: {
  insumos: { insumoItemId: string; quantidade: unknown; base: string; unidadeId: string | null;
    insumoItem: { compoeCusto: boolean; precoCusto: unknown; itemUnidades: { unidadeId: string; isPrincipal: boolean; fatorConversao: unknown }[] } }[];
}): Promise<number> {
  const ids = Array.from(new Set(eng.insumos.map((i) => i.insumoItemId)));
  const custos = await custosDaEmpresa(prismaSemEscopo, empresaId, ids);
  let total = 0;
  for (const ins of eng.insumos) {
    if (ins.insumoItem.compoeCusto === false) continue; // água
    let fator = 1;
    if (ins.unidadeId) {
      const iu = ins.insumoItem.itemUnidades.find((u) => u.unidadeId === ins.unidadeId);
      if (iu && !iu.isPrincipal && iu.fatorConversao != null) {
        const f = num(iu.fatorConversao);
        if (f > 0) fator = f;
      }
    }
    const baseFator = ins.base === "POR_UNIDADE" ? 1000 : 1; // por peça → por milheiro
    const custoUnit = custos.get(ins.insumoItemId) ?? num(ins.insumoItem.precoCusto);
    total += num(ins.quantidade) * fator * baseFator * custoUnit;
  }
  return total;
}

/**
 * Calcula o custeio de uma competência. Volume = entradas MANUAIS no estoque de PA
 * (sem ordemProducaoId). CIF pool = biomassa + energia + combustível.
 */
export async function calcularCusteio(empresaId: string, competencia: Date): Promise<CusteioResult> {
  const params = await prismaSemEscopo.parametroCusteio.findUnique({
    where: { empresaId_competencia: { empresaId, competencia } },
  });

  const dias = params?.diasTrabalhados ?? 26;
  const biomassaMes = num(params?.biomassaDia) * dias;
  const combustivelMes = num(params?.combustivelDia) * dias;
  const energiaMes = num(params?.energiaMes);
  const folhaMes = num(params?.folhaMes);
  const cifPoolMes = biomassaMes + combustivelMes + energiaMes;

  // Volume por produto: entradas manuais (sem OP) no(s) local(is) de produto acabado.
  const locaisPA = await prismaSemEscopo.localEstoque.findMany({
    where: { categoriasAceitas: { has: "PRODUTO_ACABADO" } }, select: { id: true },
  });
  const localIds = locaisPA.map((l) => l.id);
  const entradas = localIds.length
    ? await prismaSemEscopo.movimentacaoEstoque.groupBy({
        by: ["itemId"],
        where: { tipo: "ENTRADA", ordemProducaoId: null, clienteDonoId: null, localEstoqueId: { in: localIds } },
        _sum: { quantidade: true },
      })
    : [];
  const volPorItem = new Map(entradas.map((e) => [e.itemId, num(e._sum.quantidade)]));
  const itemIds = Array.from(volPorItem.keys());

  const volumeTotalUn = Array.from(volPorItem.values()).reduce((s, v) => s + v, 0);
  const volumeTotalMilheiros = volumeTotalUn / 1000;
  const cifRate = volumeTotalMilheiros > 0 ? cifPoolMes / volumeTotalMilheiros : 0;
  const modRate = volumeTotalMilheiros > 0 ? folhaMes / volumeTotalMilheiros : 0;

  // Engenharia (BOM) de cada produto produzido, p/ o custo de material.
  const itens = itemIds.length
    ? await prismaSemEscopo.item.findMany({
        where: { id: { in: itemIds } },
        select: {
          id: true, codigo: true, descricao: true,
          engenhariaProduto: {
            select: {
              insumos: {
                select: {
                  insumoItemId: true, quantidade: true, base: true, unidadeId: true,
                  insumoItem: { select: { compoeCusto: true, precoCusto: true, itemUnidades: { select: { unidadeId: true, isPrincipal: true, fatorConversao: true } } } },
                },
              },
            },
          },
        },
      })
    : [];

  const produtos: CusteioProduto[] = [];
  for (const it of itens) {
    const volumeUn = volPorItem.get(it.id) ?? 0;
    const eng = it.engenhariaProduto;
    const materialMilheiro = eng ? await materialPorMilheiro(empresaId, eng) : 0;
    const custoMilheiro = materialMilheiro + modRate + cifRate;
    produtos.push({
      itemId: it.id, codigo: it.codigo, descricao: it.descricao,
      volumeUn, volumeMilheiros: r4(volumeUn / 1000),
      materialMilheiro: r2(materialMilheiro), modMilheiro: r2(modRate), cifMilheiro: r2(cifRate),
      custoMilheiro: r2(custoMilheiro), custoUnitario: r4(custoMilheiro / 1000),
    });
  }
  produtos.sort((a, b) => b.volumeUn - a.volumeUn);

  return {
    competencia: competencia.toISOString().slice(0, 7),
    params: params ? { biomassaDia: num(params.biomassaDia), energiaMes: num(params.energiaMes), combustivelDia: num(params.combustivelDia), folhaMes: num(params.folhaMes), diasTrabalhados: dias } : null,
    biomassaMes: r2(biomassaMes), combustivelMes: r2(combustivelMes), energiaMes: r2(energiaMes),
    cifPoolMes: r2(cifPoolMes), folhaMes: r2(folhaMes),
    volumeTotalMilheiros: r4(volumeTotalMilheiros),
    cifRate: r2(cifRate), modRate: r2(modRate),
    produtos,
  };
}
