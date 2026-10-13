-- SST — Ficha de entrega de EPI por colaborador (termo p/ assinatura). Idempotente.
CREATE TABLE IF NOT EXISTS "SstEpiFicha" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "numero" INTEGER NOT NULL, "colaboradorId" TEXT NOT NULL, "data" TIMESTAMP(3) NOT NULL,
  "observacoes" TEXT, "documentoId" TEXT, "assinadaEm" TIMESTAMP(3), "criadoPor" TEXT, "atualizadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstEpiFicha_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SstEpiFicha_empresaId_numero_key" ON "SstEpiFicha"("empresaId", "numero");
CREATE INDEX IF NOT EXISTS "SstEpiFicha_colaboradorId_data_idx" ON "SstEpiFicha"("colaboradorId", "data");
DO $$ BEGIN ALTER TABLE "SstEpiFicha" ADD CONSTRAINT "SstEpiFicha_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstEpiFicha" ADD CONSTRAINT "SstEpiFicha_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TABLE "SstEpiEntrega" ADD COLUMN IF NOT EXISTS "fichaId" TEXT;
CREATE INDEX IF NOT EXISTS "SstEpiEntrega_fichaId_idx" ON "SstEpiEntrega"("fichaId");
DO $$ BEGIN ALTER TABLE "SstEpiEntrega" ADD CONSTRAINT "SstEpiEntrega_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "SstEpiFicha"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
