-- Guarda a referência crua do ajuste manual (URL do Google Maps ou "lat, lng"). Idempotente.
ALTER TABLE "Concorrente" ADD COLUMN IF NOT EXISTS "geoReferencia" TEXT;
