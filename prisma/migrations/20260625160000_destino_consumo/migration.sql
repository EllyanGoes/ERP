-- FASE 4: destino contábil desacoplado da natureza + natureza-padrão no item.
-- enum DestinoConsumo
DO $$ BEGIN
  CREATE TYPE "DestinoConsumo" AS ENUM ('PEP_MD','IMOBILIZADO','CIF','DESPESA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Item.naturezaPadraoId (FK natureza-gaveta sugerida)
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "naturezaPadraoId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Item" ADD CONSTRAINT "Item_naturezaPadraoId_fkey"
    FOREIGN KEY ("naturezaPadraoId") REFERENCES "NaturezaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- NaturezaFinanceira.destinoSugerido (só p/ alerta de coerência)
ALTER TABLE "NaturezaFinanceira" ADD COLUMN IF NOT EXISTS "destinoSugerido" "DestinoConsumo";

-- RequisicaoMaterialItem.destinoManual (escape explícito)
ALTER TABLE "RequisicaoMaterialItem" ADD COLUMN IF NOT EXISTS "destinoManual" "DestinoConsumo";
