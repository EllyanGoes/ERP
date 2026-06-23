-- Coordenadas manuais do concorrente (pino arrastado / coladas do Google Maps).
-- Quando true, o geocoding automático não sobrescreve lat/lng. Idempotente.
ALTER TABLE "Concorrente" ADD COLUMN IF NOT EXISTS "geoManual" BOOLEAN NOT NULL DEFAULT false;
