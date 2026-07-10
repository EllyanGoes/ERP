-- Venda à ordem POR ITEM: origem do estoque por linha do pedido (sobrepõe a
-- origem padrão do pedido). Idempotente.
ALTER TABLE "PedidoVendaItem" ADD COLUMN IF NOT EXISTS "estoqueOrigemEmpresaId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PedidoVendaItem_estoqueOrigemEmpresaId_fkey'
  ) THEN
    ALTER TABLE "PedidoVendaItem"
      ADD CONSTRAINT "PedidoVendaItem_estoqueOrigemEmpresaId_fkey"
      FOREIGN KEY ("estoqueOrigemEmpresaId") REFERENCES "Empresa"(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PedidoVendaItem_estoqueOrigemEmpresaId_idx"
  ON "PedidoVendaItem"("estoqueOrigemEmpresaId");
