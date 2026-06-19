// Valoração do estoque com a regra interina de custeio:
//  - Produto Acabado (fabricado): numa empresa de REVENDA (não industrializa)
//    com custo de compra do item (ItemCustoEmpresa.precoCusto), valora por esse
//    custo — é o que permite custear entrada E CMV pelo preço de compra (ex.:
//    Cimento e Mix revende o tijolo da Tramontin). Numa empresa FABRICANTE, segue
//    pelo PREÇO MÉDIO DE VENDA (precoVendaMedio, fallback precoVenda), pois o custo
//    de produção só virá do PCP.
//  - Demais categorias (mercadoria/insumo/almoxarifado): custo médio da empresa
//    (ItemCustoEmpresa.precoCusto), fallback CMPM global (Item.precoCusto).

import { prismaSemEscopo } from "@/lib/prisma";
import { custosDaEmpresa } from "@/lib/custo-empresa";

const n = (v: unknown): number | null => {
  if (v == null) return null;
  const x = parseFloat(String(v));
  return Number.isFinite(x) ? x : null;
};

export type ItemValoravel = {
  categoriaEstoque?: string | null;
  precoVendaMedio?: number | null;
  precoVenda?: number | null;
  precoCusto?: number | null;
};

/**
 * Valor unitário de 1 unidade em estoque, conforme a regra de custeio.
 * `empresaRevende` = a empresa NÃO industrializa (revenda pura) — só então o
 * acabado é custeado pelo custo de compra da empresa, em vez do preço de venda.
 */
export function valorUnitarioEstoque(item: ItemValoravel, custoEmpresa?: number | null, empresaRevende = false): number {
  if (item.categoriaEstoque === "PRODUTO_ACABADO") {
    if (empresaRevende && custoEmpresa != null) return custoEmpresa; // revenda: custo de compra
    return item.precoVendaMedio ?? item.precoVenda ?? 0;
  }
  return custoEmpresa ?? item.precoCusto ?? 0;
}

export type ValorItem = { valorUnitario: number; categoria: string | null };

/**
 * Valor unitário de estoque por item, numa empresa (para o motor contábil):
 * Map itemId → { valorUnitario, categoria }. Acabado: custo de compra na revenda,
 * preço médio de venda na fábrica; demais pelo custo da empresa / CMPM global.
 */
export async function valoresEstoqueDaEmpresa(empresaId: string, itemIds: string[]): Promise<Map<string, ValorItem>> {
  const out = new Map<string, ValorItem>();
  if (itemIds.length === 0) return out;
  const ids = Array.from(new Set(itemIds));
  const [empresa, itens, custos] = await Promise.all([
    prismaSemEscopo.empresa.findUnique({ where: { id: empresaId }, select: { industrializa: true } }),
    prismaSemEscopo.item.findMany({
      where: { id: { in: ids } },
      select: { id: true, categoriaEstoque: true, precoVendaMedio: true, precoVenda: true, precoCusto: true },
    }),
    custosDaEmpresa(prismaSemEscopo, empresaId, ids),
  ]);
  const revende = empresa?.industrializa === false;
  for (const it of itens) {
    const valor = valorUnitarioEstoque(
      { categoriaEstoque: it.categoriaEstoque, precoVendaMedio: n(it.precoVendaMedio), precoVenda: n(it.precoVenda), precoCusto: n(it.precoCusto) },
      custos.get(it.id) ?? null,
      revende,
    );
    out.set(it.id, { valorUnitario: valor, categoria: it.categoriaEstoque ?? null });
  }
  return out;
}
