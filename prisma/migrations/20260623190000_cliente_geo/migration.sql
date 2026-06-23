-- Geolocalização do cliente (geomarketing / aba Localização). Idempotente.
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "latitude"      DOUBLE PRECISION;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "longitude"     DOUBLE PRECISION;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "geoManual"     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "geoReferencia" TEXT;
