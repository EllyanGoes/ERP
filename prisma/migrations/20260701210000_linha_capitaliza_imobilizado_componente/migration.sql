-- Capitaliza (capex vs opex, degrau do meio da precedência), bem e componente
-- substituído na LINHA da entrada e da RM. Aditivo e idempotente.
-- capitaliza é NULLABLE: null = herda item.capitaliza; true/false = decisão da linha.

-- Origem contábil da baixa de componente (troca, CPC 27).
ALTER TYPE "OrigemLancamento" ADD VALUE IF NOT EXISTS 'BAIXA_IMOBILIZADO';

ALTER TABLE "ConferenciaCompraItem" ADD COLUMN IF NOT EXISTS "capitaliza" BOOLEAN;
ALTER TABLE "ConferenciaCompraItem" ADD COLUMN IF NOT EXISTS "imobilizadoId" TEXT;
ALTER TABLE "ConferenciaCompraItem" ADD COLUMN IF NOT EXISTS "componenteSubstituidoId" TEXT;

ALTER TABLE "RequisicaoMaterialItem" ADD COLUMN IF NOT EXISTS "capitaliza" BOOLEAN;
ALTER TABLE "RequisicaoMaterialItem" ADD COLUMN IF NOT EXISTS "imobilizadoId" TEXT;
ALTER TABLE "RequisicaoMaterialItem" ADD COLUMN IF NOT EXISTS "componenteSubstituidoId" TEXT;

DO $$ BEGIN
  ALTER TABLE "ConferenciaCompraItem"
    ADD CONSTRAINT "ConferenciaCompraItem_imobilizadoId_fkey"
    FOREIGN KEY ("imobilizadoId") REFERENCES "Imobilizado"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ConferenciaCompraItem"
    ADD CONSTRAINT "ConferenciaCompraItem_componenteSubstituidoId_fkey"
    FOREIGN KEY ("componenteSubstituidoId") REFERENCES "Imobilizado"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "RequisicaoMaterialItem"
    ADD CONSTRAINT "RequisicaoMaterialItem_imobilizadoId_fkey"
    FOREIGN KEY ("imobilizadoId") REFERENCES "Imobilizado"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "RequisicaoMaterialItem"
    ADD CONSTRAINT "RequisicaoMaterialItem_componenteSubstituidoId_fkey"
    FOREIGN KEY ("componenteSubstituidoId") REFERENCES "Imobilizado"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "ConferenciaCompraItem_imobilizadoId_idx" ON "ConferenciaCompraItem"("imobilizadoId");
CREATE INDEX IF NOT EXISTS "RequisicaoMaterialItem_imobilizadoId_idx" ON "RequisicaoMaterialItem"("imobilizadoId");
