-- Venda à ordem (triangular): tag que liga os 3 movimentos virtuais de estoque
-- (saída na origem + entrada/saída na empresa da venda) ao pedido de venda.
-- Idempotente.

ALTER TABLE "MovimentacaoEstoque" ADD COLUMN IF NOT EXISTS "vendaOrdemId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'MovimentacaoEstoque_vendaOrdemId_fkey'
  ) THEN
    ALTER TABLE "MovimentacaoEstoque"
      ADD CONSTRAINT "MovimentacaoEstoque_vendaOrdemId_fkey"
      FOREIGN KEY ("vendaOrdemId") REFERENCES "PedidoVenda"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "MovimentacaoEstoque_vendaOrdemId_idx" ON "MovimentacaoEstoque"("vendaOrdemId");
