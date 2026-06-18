-- Preço médio de venda por item (média ponderada por quantidade dos pedidos de
-- venda efetivados) — base de valoração do estoque de Produto Acabado enquanto
-- não há custo de produção (PCP). Idempotente.

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "precoVendaMedio" DECIMAL(15,2);

UPDATE "Item" i
SET "precoVendaMedio" = sub.media
FROM (
  SELECT pvi."itemId" AS item_id,
         ROUND(SUM(pvi."precoUnitario" * pvi."quantidade") / NULLIF(SUM(pvi."quantidade"), 0), 2) AS media
  FROM "PedidoVendaItem" pvi
  JOIN "PedidoVenda" pv ON pv."id" = pvi."pedidoVendaId"
  WHERE pv."status" NOT IN ('ORCAMENTO', 'CANCELADO')
    AND pvi."precoUnitario" > 0 AND pvi."quantidade" > 0
  GROUP BY pvi."itemId"
) sub
WHERE i."id" = sub.item_id;
