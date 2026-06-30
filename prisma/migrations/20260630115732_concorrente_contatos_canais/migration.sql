-- Concorrente: múltiplos contatos e múltiplos canais de aquisição de clientes.
-- A localização física conta como um canal (tipo LOCALIZACAO). Idempotente.

CREATE TABLE IF NOT EXISTS "ConcorrenteContato" (
  "id"            TEXT NOT NULL,
  "empresaId"     TEXT NOT NULL DEFAULT 'emp_tramontin',
  "concorrenteId" TEXT NOT NULL,
  "nome"          TEXT NOT NULL,
  "cargo"         TEXT,
  "telefone"      TEXT,
  "email"         TEXT,
  "observacao"    TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConcorrenteContato_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ConcorrenteCanal" (
  "id"            TEXT NOT NULL,
  "empresaId"     TEXT NOT NULL DEFAULT 'emp_tramontin',
  "concorrenteId" TEXT NOT NULL,
  "tipo"          TEXT NOT NULL,
  "valor"         TEXT,
  "observacao"    TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConcorrenteCanal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ConcorrenteContato_concorrenteId_idx" ON "ConcorrenteContato"("concorrenteId");
CREATE INDEX IF NOT EXISTS "ConcorrenteCanal_concorrenteId_idx"   ON "ConcorrenteCanal"("concorrenteId");

DO $$ BEGIN
  ALTER TABLE "ConcorrenteContato"
    ADD CONSTRAINT "ConcorrenteContato_concorrenteId_fkey"
    FOREIGN KEY ("concorrenteId") REFERENCES "Concorrente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ConcorrenteCanal"
    ADD CONSTRAINT "ConcorrenteCanal_concorrenteId_fkey"
    FOREIGN KEY ("concorrenteId") REFERENCES "Concorrente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
