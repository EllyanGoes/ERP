-- Unidade de compra por item (Pedido de Compra e Conferência), para conversão
-- automática de quantidade/preço para a unidade base ao dar entrada no estoque.
-- null = unidade base do item (sem conversão). Idempotente.

ALTER TABLE "PedidoCompraItem"     ADD COLUMN IF NOT EXISTS "unidadeId" TEXT;
ALTER TABLE "ConferenciaCompraItem" ADD COLUMN IF NOT EXISTS "unidadeId" TEXT;
