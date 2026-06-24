ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "matricula" TEXT;
CREATE INDEX IF NOT EXISTS "Colaborador_matricula_idx" ON "Colaborador"("matricula");
