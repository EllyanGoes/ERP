// Preço médio de venda por item: média ponderada por quantidade de
// PedidoVendaItem.precoUnitario dos pedidos efetivados (não orçamento/cancelado).
// Base de valoração do estoque de Produto Acabado enquanto não há custo de
// produção (PCP). Recalcula Item.precoVendaMedio (global).

import { prismaSemEscopo } from "@/lib/prisma";

/** Recalcula precoVendaMedio de todos os itens (ou de um subconjunto). */
export async function recalcularPrecoVendaMedio(itemIds?: string[]): Promise<number> {
  const filtro = itemIds && itemIds.length
    ? `AND pvi."itemId" = ANY($1::text[])`
    : "";
  // Zera os que não têm venda efetivada (para refletir quando some o histórico).
  const sql = `
    WITH medias AS (
      SELECT pvi."itemId" AS item_id,
             ROUND(SUM(pvi."precoUnitario" * pvi."quantidade") / NULLIF(SUM(pvi."quantidade"), 0), 2) AS media
      FROM "PedidoVendaItem" pvi
      JOIN "PedidoVenda" pv ON pv."id" = pvi."pedidoVendaId"
      WHERE pv."status" NOT IN ('ORCAMENTO', 'CANCELADO')
        AND pvi."precoUnitario" > 0 AND pvi."quantidade" > 0 ${filtro}
      GROUP BY pvi."itemId"
    )
    UPDATE "Item" i SET "precoVendaMedio" = m.media
    FROM medias m WHERE i."id" = m.item_id`;
  if (itemIds && itemIds.length) {
    return prismaSemEscopo.$executeRawUnsafe(sql, itemIds);
  }
  return prismaSemEscopo.$executeRawUnsafe(sql);
}
