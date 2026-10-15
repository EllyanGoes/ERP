-- ASO: tipo "mudança de função" (eSocial S-2220 tpExameOcup 3) + cadastro de médicos.
ALTER TYPE "SstTipoAso" ADD VALUE IF NOT EXISTS 'MUDANCA_FUNCAO' BEFORE 'MUDANCA_RISCO';

CREATE TABLE IF NOT EXISTS "SstMedico" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "crm" TEXT NOT NULL,
  "uf" TEXT,
  "especialidade" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstMedico_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SstMedico_empresaId_crm_key" ON "SstMedico"("empresaId", "crm");
DO $$ BEGIN
  ALTER TABLE "SstMedico" ADD CONSTRAINT "SstMedico_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "SstAso" ADD COLUMN IF NOT EXISTS "medicoId" TEXT;
DO $$ BEGIN
  ALTER TABLE "SstAso" ADD CONSTRAINT "SstAso_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "SstMedico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Semeia o cadastro com os médicos já digitados nos ASOs (um por empresa+CRM)
-- e liga os ASOs existentes.
INSERT INTO "SstMedico" ("id", "empresaId", "nome", "crm", "updatedAt")
SELECT 'sstmed_' || substr(md5(a."empresaId" || upper(trim(a.crm))), 1, 20), a."empresaId",
       (array_agg(trim(a.medico) ORDER BY a.data DESC))[1], upper(trim(a.crm)), now()
FROM "SstAso" a
WHERE coalesce(trim(a.crm), '') <> '' AND coalesce(trim(a.medico), '') <> ''
GROUP BY a."empresaId", upper(trim(a.crm))
ON CONFLICT ("empresaId", "crm") DO NOTHING;

UPDATE "SstAso" a SET "medicoId" = m.id
FROM "SstMedico" m
WHERE a."medicoId" IS NULL AND m."empresaId" = a."empresaId" AND m.crm = upper(trim(a.crm));
