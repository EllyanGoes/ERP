-- Projeto por empresa (opcional): empresaId null = projeto GERAL do grupo.
-- Tag e filtro na home de Projetos. Idempotente (padrão do projeto).
ALTER TABLE "Projeto" ADD COLUMN IF NOT EXISTS "empresaId" TEXT;
CREATE INDEX IF NOT EXISTS "Projeto_empresaId_idx" ON "Projeto"("empresaId");
DO $$ BEGIN
  ALTER TABLE "Projeto" ADD CONSTRAINT "Projeto_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
