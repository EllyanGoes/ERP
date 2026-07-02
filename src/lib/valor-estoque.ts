// Valoração do estoque com a regra interina de custeio:
//  - Produto Acabado: com custo da empresa registrado (ItemCustoEmpresa.precoCusto
//    — custo de compra na revenda, ex.: Cimento e Mix revende o tijolo da
//    Tramontin; ou custo de produção quando o PCP já custeou), valora por esse
//    custo. Sem custo registrado, cai no PREÇO MÉDIO DE VENDA (precoVendaMedio,
//    fallback precoVenda).
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
 * Valor unitário de 1 unidade em estoque, conforme a regra de custeio: acabado
 * pelo custo da empresa quando existir (compra na revenda / produção via PCP),
 * senão preço médio de venda; demais categorias pelo custo da empresa com
 * fallback no CMPM global.
 */
export function valorUnitarioEstoque(item: ItemValoravel, custoEmpresa?: number | null): number {
  if (item.categoriaEstoque === "PRODUTO_ACABADO") {
    // Custo da empresa quando existe: de compra (revenda) ou de produção (PCP já
    // custeou o acabado). Sem custo registrado, cai no preço médio de venda.
    if (custoEmpresa != null) return custoEmpresa;
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
  const [itens, custos] = await Promise.all([
    prismaSemEscopo.item.findMany({
      where: { id: { in: ids } },
      select: { id: true, categoriaEstoque: true, precoVendaMedio: true, precoVenda: true, precoCusto: true },
    }),
    custosDaEmpresa(prismaSemEscopo, empresaId, ids),
  ]);
  for (const it of itens) {
    const valor = valorUnitarioEstoque(
      { categoriaEstoque: it.categoriaEstoque, precoVendaMedio: n(it.precoVendaMedio), precoVenda: n(it.precoVenda), precoCusto: n(it.precoCusto) },
      custos.get(it.id) ?? null,
    );
    out.set(it.id, { valorUnitario: valor, categoria: it.categoriaEstoque ?? null });
  }
  return out;
}
