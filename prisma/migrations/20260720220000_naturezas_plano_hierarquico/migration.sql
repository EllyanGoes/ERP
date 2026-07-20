-- Reestruturação do plano de naturezas financeiras (jul/2026): plano
-- hierárquico de 9 grupos com código ("2.04"), naturezas antigas DESATIVADAS
-- apontando a sucessora (histórico intacto — nada é excluído nem migrado
-- retroativamente). O seed do plano roda à parte (rota admin), não aqui.
-- Idempotente.

ALTER TYPE "NaturezaTipo" ADD VALUE IF NOT EXISTS 'AMBOS';
ALTER TYPE "NaturezaGrupo" ADD VALUE IF NOT EXISTS 'MOVIMENTACAO_INTERNA';

ALTER TABLE "NaturezaFinanceira" ADD COLUMN IF NOT EXISTS "codigo" TEXT;
ALTER TABLE "NaturezaFinanceira" ADD COLUMN IF NOT EXISTS "afetaResultado" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NaturezaFinanceira" ADD COLUMN IF NOT EXISTS "sucessoraId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NaturezaFinanceira_sucessoraId_fkey') THEN
    ALTER TABLE "NaturezaFinanceira"
      ADD CONSTRAINT "NaturezaFinanceira_sucessoraId_fkey"
      FOREIGN KEY ("sucessoraId") REFERENCES "NaturezaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "NaturezaFinanceira_empresaId_codigo_key" ON "NaturezaFinanceira"("empresaId", "codigo");
CREATE INDEX IF NOT EXISTS "NaturezaFinanceira_sucessoraId_idx" ON "NaturezaFinanceira"("sucessoraId");
