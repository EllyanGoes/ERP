-- Localização vira um tipo de canal: ConcorrenteCanal ganha campos de endereço/geo
-- (usados quando tipo=LOCALIZACAO). Aposenta o ConcorrenteLocal. Idempotente.
ALTER TABLE "ConcorrenteCanal" ADD COLUMN IF NOT EXISTS "cep" TEXT;
ALTER TABLE "ConcorrenteCanal" ADD COLUMN IF NOT EXISTS "logradouro" TEXT;
ALTER TABLE "ConcorrenteCanal" ADD COLUMN IF NOT EXISTS "numero" TEXT;
ALTER TABLE "ConcorrenteCanal" ADD COLUMN IF NOT EXISTS "complemento" TEXT;
ALTER TABLE "ConcorrenteCanal" ADD COLUMN IF NOT EXISTS "bairro" TEXT;
ALTER TABLE "ConcorrenteCanal" ADD COLUMN IF NOT EXISTS "cidade" TEXT;
ALTER TABLE "ConcorrenteCanal" ADD COLUMN IF NOT EXISTS "estado" TEXT;
ALTER TABLE "ConcorrenteCanal" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "ConcorrenteCanal" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "ConcorrenteCanal" ADD COLUMN IF NOT EXISTS "geoManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConcorrenteCanal" ADD COLUMN IF NOT EXISTS "geoReferencia" TEXT;
ALTER TABLE "ConcorrenteCanal" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP TABLE IF EXISTS "ConcorrenteLocal";
