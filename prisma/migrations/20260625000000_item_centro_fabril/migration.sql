-- Flag "fabril" no Item (consumível indireto de fábrica) e no CentroCusto (centro fabril).
-- Aditivo, default false — não altera comportamento dos registros existentes.
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "fabril" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CentroCusto" ADD COLUMN IF NOT EXISTS "fabril" BOOLEAN NOT NULL DEFAULT false;
