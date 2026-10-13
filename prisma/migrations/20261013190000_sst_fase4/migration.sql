-- SST — Fase 4: horas trabalhadas e snapshot de conformidade. Idempotente.
CREATE TABLE IF NOT EXISTS "SstHorasMes" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "ano" INTEGER NOT NULL, "mes" INTEGER NOT NULL, "horas" DECIMAL(12,2) NOT NULL, "empregados" INTEGER,
  "observacoes" TEXT, "criadoPor" TEXT, "atualizadoPor" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstHorasMes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SstHorasMes_empresaId_ano_mes_key" ON "SstHorasMes"("empresaId", "ano", "mes");
CREATE TABLE IF NOT EXISTS "SstConformidadeSnapshot" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "data" TIMESTAMP(3) NOT NULL, "totais" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SstConformidadeSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SstConformidadeSnapshot_empresaId_data_key" ON "SstConformidadeSnapshot"("empresaId", "data");
DO $$ BEGIN ALTER TABLE "SstHorasMes" ADD CONSTRAINT "SstHorasMes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstConformidadeSnapshot" ADD CONSTRAINT "SstConformidadeSnapshot_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
