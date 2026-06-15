-- Venda à ordem: preço de compra unitário por item (empresa da venda ← origem).
-- Idempotente.
ALTER TABLE "PedidoVendaItem" ADD COLUMN IF NOT EXISTS "precoTransferencia" DECIMAL(15,2);
