-- TES na linha do pedido de compras (herda para a entrada). Aditivo e idempotente.

ALTER TABLE "PedidoCompraItem" ADD COLUMN IF NOT EXISTS "tesId" TEXT;
ALTER TABLE "PedidoCompraItem" ADD COLUMN IF NOT EXISTS "compoeCusto" BOOLEAN;

DO $$ BEGIN
  ALTER TABLE "PedidoCompraItem" ADD CONSTRAINT "PedidoCompraItem_tesId_fkey"
    FOREIGN KEY ("tesId") REFERENCES "TipoOperacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "PedidoCompraItem_tesId_idx" ON "PedidoCompraItem"("tesId");
