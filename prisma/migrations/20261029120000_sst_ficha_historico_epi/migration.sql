-- SST: ficha de EPI de histórico (uma aberta por colaborador) + EPI descartável.
ALTER TABLE "SstEpi" ADD COLUMN IF NOT EXISTS "descartavel" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SstEpiFicha" ADD COLUMN IF NOT EXISTS "historico" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SstEpiFicha" ADD COLUMN IF NOT EXISTS "fechadaEm" TIMESTAMP(3);
-- Backstop: no máximo uma ficha de histórico aberta por colaborador.
CREATE UNIQUE INDEX IF NOT EXISTS "SstEpiFicha_historico_aberta_key" ON "SstEpiFicha" ("colaboradorId") WHERE "historico" AND "fechadaEm" IS NULL;
