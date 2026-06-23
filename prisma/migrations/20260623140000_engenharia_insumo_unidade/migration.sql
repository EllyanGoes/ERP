-- Unidade por linha na BOM (em qual unidade a quantidade do insumo está expressa). Idempotente.
ALTER TABLE "EngenhariaInsumo" ADD COLUMN IF NOT EXISTS "unidadeId" TEXT;
