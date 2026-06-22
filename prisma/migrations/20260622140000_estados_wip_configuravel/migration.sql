-- Catálogo configurável de estados de WIP + estados atendidos por produto. Idempotente.
CREATE TABLE IF NOT EXISTS "EstadoWip" (
  "id"        TEXT PRIMARY KEY,
  "codigo"    TEXT NOT NULL,
  "nome"      TEXT NOT NULL,
  "ordem"     INTEGER NOT NULL DEFAULT 0,
  "ativo"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "EstadoWip_codigo_key" ON "EstadoWip"("codigo");

-- Estados WIP que o produto atende (códigos de EstadoWip).
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "estadosWip" TEXT[] NOT NULL DEFAULT '{}';

-- Seed dos 4 estados base (mesmos códigos do enum legado EstadoWIP).
INSERT INTO "EstadoWip" ("id", "codigo", "nome", "ordem", "updatedAt") VALUES
  ('estwip_umido',    'UMIDO',    'Úmido',    1, now()),
  ('estwip_seco',     'SECO',     'Seco',     2, now()),
  ('estwip_queimado', 'QUEIMADO', 'Queimado', 3, now()),
  ('estwip_acabado',  'ACABADO',  'Acabado',  4, now())
ON CONFLICT ("codigo") DO NOTHING;
