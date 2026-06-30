-- Lançamento de diárias (diaristas): folha do dia → blocos (grupos) → itens.
CREATE TABLE IF NOT EXISTS "DiariaFolha" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "data" DATE NOT NULL, "observacoes" TEXT, "status" TEXT NOT NULL DEFAULT 'ABERTA',
  "total" DECIMAL(15,2) NOT NULL DEFAULT 0, "criadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiariaFolha_pkey" PRIMARY KEY ("id"));
CREATE TABLE IF NOT EXISTS "DiariaGrupo" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "folhaId" TEXT NOT NULL, "tipo" TEXT NOT NULL DEFAULT 'DIVERSAS', "setor" TEXT,
  "turno" TEXT NOT NULL DEFAULT 'DIA', "ordem" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "DiariaGrupo_pkey" PRIMARY KEY ("id"));
CREATE TABLE IF NOT EXISTS "DiariaItem" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "grupoId" TEXT NOT NULL, "colaboradorId" TEXT NOT NULL, "servico" TEXT,
  "valor" DECIMAL(15,2) NOT NULL DEFAULT 0, "ordem" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "DiariaItem_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "DiariaFolha_empresaId_data_idx" ON "DiariaFolha"("empresaId","data");
CREATE INDEX IF NOT EXISTS "DiariaGrupo_folhaId_idx" ON "DiariaGrupo"("folhaId");
CREATE INDEX IF NOT EXISTS "DiariaItem_grupoId_idx" ON "DiariaItem"("grupoId");
CREATE INDEX IF NOT EXISTS "DiariaItem_colaboradorId_idx" ON "DiariaItem"("colaboradorId");
DO $$ BEGIN
  ALTER TABLE "DiariaFolha" ADD CONSTRAINT "DiariaFolha_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DiariaGrupo" ADD CONSTRAINT "DiariaGrupo_folhaId_fkey" FOREIGN KEY ("folhaId") REFERENCES "DiariaFolha"("id") ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DiariaItem" ADD CONSTRAINT "DiariaItem_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "DiariaGrupo"("id") ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DiariaItem" ADD CONSTRAINT "DiariaItem_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
