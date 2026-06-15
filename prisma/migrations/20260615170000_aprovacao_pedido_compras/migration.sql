-- Aprovação migra da SC para a Cotação → Pedido de Compras.
-- Idempotente: pode rodar mais de uma vez sem erro.

-- Novo status da cotação (aguardando aprovação do gerente) e novo processo.
ALTER TYPE "StatusCotacaoCompra" ADD VALUE IF NOT EXISTS 'AGUARDANDO_APROVACAO';
ALTER TYPE "ProcessoAprovacao" ADD VALUE IF NOT EXISTS 'PEDIDO_COMPRAS';

-- AprovacaoSC passa a poder referenciar uma cotação (necessidadeId vira opcional).
ALTER TABLE "AprovacaoSC" ALTER COLUMN "necessidadeId" DROP NOT NULL;
ALTER TABLE "AprovacaoSC" ADD COLUMN IF NOT EXISTS "cotacaoId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AprovacaoSC_cotacaoId_fkey'
  ) THEN
    ALTER TABLE "AprovacaoSC"
      ADD CONSTRAINT "AprovacaoSC_cotacaoId_fkey"
      FOREIGN KEY ("cotacaoId") REFERENCES "CotacaoCompra"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AprovacaoSC_cotacaoId_idx" ON "AprovacaoSC"("cotacaoId");
