-- Setores em árvore (setor pai → subsetores), como o plano de contas.
-- Migration idempotente (padrão do projeto — nunca db push em prod).
ALTER TABLE "Setor" ADD COLUMN IF NOT EXISTS "paiId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Setor" ADD CONSTRAINT "Setor_paiId_fkey"
    FOREIGN KEY ("paiId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "Setor_paiId_idx" ON "Setor"("paiId");
