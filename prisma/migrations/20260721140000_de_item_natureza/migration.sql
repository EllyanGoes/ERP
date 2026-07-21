-- Natureza financeira POR ITEM no Documento de Entrada (como o centro de
-- custo): default vem da sugestão do TES da linha, editável; alimenta o rateio
-- multi-natureza do CP na conclusão. Idempotente.

ALTER TABLE "ConferenciaCompraItem" ADD COLUMN IF NOT EXISTS "naturezaFinanceiraId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConferenciaCompraItem_naturezaFinanceiraId_fkey') THEN
    ALTER TABLE "ConferenciaCompraItem"
      ADD CONSTRAINT "ConferenciaCompraItem_naturezaFinanceiraId_fkey"
      FOREIGN KEY ("naturezaFinanceiraId") REFERENCES "NaturezaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ConferenciaCompraItem_naturezaFinanceiraId_idx" ON "ConferenciaCompraItem"("naturezaFinanceiraId");
