-- Locais físicos adicionais do concorrente (filiais/depósitos), geolocalizados.
-- O endereço do próprio Concorrente segue como local principal. Idempotente.
CREATE TABLE IF NOT EXISTS "ConcorrenteLocal" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "concorrenteId" TEXT NOT NULL,
  "nome" TEXT,
  "cep" TEXT, "logradouro" TEXT, "numero" TEXT, "complemento" TEXT,
  "bairro" TEXT, "cidade" TEXT, "estado" TEXT,
  "latitude" DOUBLE PRECISION, "longitude" DOUBLE PRECISION,
  "geoManual" BOOLEAN NOT NULL DEFAULT false,
  "geoReferencia" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConcorrenteLocal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ConcorrenteLocal_concorrenteId_idx" ON "ConcorrenteLocal"("concorrenteId");
DO $$ BEGIN
  ALTER TABLE "ConcorrenteLocal" ADD CONSTRAINT "ConcorrenteLocal_concorrenteId_fkey"
    FOREIGN KEY ("concorrenteId") REFERENCES "Concorrente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
