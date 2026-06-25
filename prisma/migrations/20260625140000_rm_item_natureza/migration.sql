-- Natureza financeira POR ITEM na requisição de material (aditivo; cabeçalho mantido como fallback).
ALTER TABLE "RequisicaoMaterialItem" ADD COLUMN IF NOT EXISTS "naturezaFinanceiraId" TEXT;
DO $$ BEGIN
  ALTER TABLE "RequisicaoMaterialItem"
    ADD CONSTRAINT "RequisicaoMaterialItem_naturezaFinanceiraId_fkey"
    FOREIGN KEY ("naturezaFinanceiraId") REFERENCES "NaturezaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
