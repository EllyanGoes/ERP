-- Código sequencial do lançamento contábil (ex.: LC-2026-0001) para identificar
-- o lançamento no razão sem percorrer toda a rastreabilidade. Idempotente.
ALTER TABLE "LancamentoContabil" ADD COLUMN IF NOT EXISTS "numero" text;

CREATE UNIQUE INDEX IF NOT EXISTS "LancamentoContabil_empresaId_numero_key"
  ON "LancamentoContabil" ("empresaId", "numero");
