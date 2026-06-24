-- Natureza financeira na Requisição de Material: roteia a saída de estoque
-- (ex.: natureza CIF → consumo vai para "CIF a Apropriar" 1.1.4.0001). Aditivo.
ALTER TABLE "RequisicaoMaterial" ADD COLUMN IF NOT EXISTS "naturezaFinanceiraId" TEXT;

DO $$ BEGIN
  ALTER TABLE "RequisicaoMaterial"
    ADD CONSTRAINT "RequisicaoMaterial_naturezaFinanceiraId_fkey"
    FOREIGN KEY ("naturezaFinanceiraId") REFERENCES "NaturezaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "RequisicaoMaterial_naturezaFinanceiraId_idx" ON "RequisicaoMaterial"("naturezaFinanceiraId");
