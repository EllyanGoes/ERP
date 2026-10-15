-- Exames complementares independentes do ASO (podem vir depois dele).
CREATE TABLE IF NOT EXISTS "SstExame" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "colaboradorId" TEXT NOT NULL,
  "exameTipoId" TEXT NOT NULL,
  "data" TIMESTAMP(3) NOT NULL,
  "resultado" TEXT,
  "observacao" TEXT,
  "documentoId" TEXT,
  "asoId" TEXT,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstExame_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SstExame_colaboradorId_exameTipoId_data_idx" ON "SstExame"("colaboradorId", "exameTipoId", "data");
CREATE INDEX IF NOT EXISTS "SstExame_asoId_idx" ON "SstExame"("asoId");
DO $$ BEGIN
  ALTER TABLE "SstExame" ADD CONSTRAINT "SstExame_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "SstExame" ADD CONSTRAINT "SstExame_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "SstExame" ADD CONSTRAINT "SstExame_exameTipoId_fkey" FOREIGN KEY ("exameTipoId") REFERENCES "SstExameTipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "SstExame" ADD CONSTRAINT "SstExame_asoId_fkey" FOREIGN KEY ("asoId") REFERENCES "SstAso"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Copia os exames lançados dentro dos ASOs (id determinístico = idempotente).
INSERT INTO "SstExame" ("id", "empresaId", "colaboradorId", "exameTipoId", "data", "resultado", "documentoId", "asoId", "criadoPor", "updatedAt")
SELECT 'sstex_' || substr(md5(ae."asoId" || ae."exameTipoId"), 1, 20), a."empresaId", a."colaboradorId", ae."exameTipoId", ae.data, ae.resultado, ae."documentoId", ae."asoId", a."criadoPor", now()
FROM "SstAsoExame" ae JOIN "SstAso" a ON a.id = ae."asoId"
ON CONFLICT ("id") DO NOTHING;
