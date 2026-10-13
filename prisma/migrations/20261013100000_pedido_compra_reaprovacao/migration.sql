-- Re-aprovação do Pedido de Compras editado. Idempotente.
ALTER TYPE "StatusPedidoCompra" ADD VALUE IF NOT EXISTS 'AGUARDANDO_APROVACAO';

ALTER TABLE "AprovacaoSC" ADD COLUMN IF NOT EXISTS "pedidoCompraId" TEXT;
CREATE INDEX IF NOT EXISTS "AprovacaoSC_pedidoCompraId_idx" ON "AprovacaoSC"("pedidoCompraId");
DO $$ BEGIN
  ALTER TABLE "AprovacaoSC" ADD CONSTRAINT "AprovacaoSC_pedidoCompraId_fkey" FOREIGN KEY ("pedidoCompraId") REFERENCES "PedidoCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
