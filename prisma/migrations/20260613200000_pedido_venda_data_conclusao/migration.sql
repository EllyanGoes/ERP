-- Data de conclusão própria do pedido de venda (separada da data de entrega).
-- Antes, a conclusão reaproveitava dataEntrega (data de entrega), o que misturava
-- dois conceitos e impedia informar a data ao concluir lançamentos passados.
-- Idempotente.
ALTER TABLE "PedidoVenda" ADD COLUMN IF NOT EXISTS "dataConclusao" TIMESTAMP(3);

-- Backfill: para pedidos já CONCLUÍDOS, preserva o que a tela mostrava como
-- "Conclusão" (a antiga dataEntrega) na nova coluna.
UPDATE "PedidoVenda"
   SET "dataConclusao" = "dataEntrega"
 WHERE status = 'CONCLUIDO'
   AND "dataConclusao" IS NULL
   AND "dataEntrega" IS NOT NULL;
