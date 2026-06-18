-- Venda à ordem (triangular): no pedido de ENTREGA da matriz, o `cliente` passa
-- a ser o adquirente (empresa intermediária) e o cliente final fica em
-- `clienteFinalId` (destinatário). Coluna opcional; null no fluxo normal.
-- Idempotente.

ALTER TABLE "PedidoVenda" ADD COLUMN IF NOT EXISTS "clienteFinalId" TEXT;

CREATE INDEX IF NOT EXISTS "PedidoVenda_clienteFinalId_idx" ON "PedidoVenda"("clienteFinalId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PedidoVenda_clienteFinalId_fkey'
  ) THEN
    ALTER TABLE "PedidoVenda"
      ADD CONSTRAINT "PedidoVenda_clienteFinalId_fkey"
      FOREIGN KEY ("clienteFinalId") REFERENCES "Cliente"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
