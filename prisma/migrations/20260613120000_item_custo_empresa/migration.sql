-- Custo médio (CMPM) por empresa do grupo. O cadastro do produto é
-- compartilhado, mas cada empresa tem o próprio custo (fabricação numa,
-- compra noutra). Item.precoCusto segue como CMPM global/legado (fallback).

CREATE TABLE IF NOT EXISTS "ItemCustoEmpresa" (
  "id"         TEXT NOT NULL,
  "empresaId"  TEXT NOT NULL,
  "itemId"     TEXT NOT NULL,
  "precoCusto" DECIMAL(15,2),
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ItemCustoEmpresa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ItemCustoEmpresa_empresaId_itemId_key"
  ON "ItemCustoEmpresa"("empresaId", "itemId");
CREATE INDEX IF NOT EXISTS "ItemCustoEmpresa_itemId_idx"
  ON "ItemCustoEmpresa"("itemId");

DO $do$ BEGIN
  ALTER TABLE "ItemCustoEmpresa"
    ADD CONSTRAINT "ItemCustoEmpresa_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  ALTER TABLE "ItemCustoEmpresa"
    ADD CONSTRAINT "ItemCustoEmpresa_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Seed: cada empresa que já possui estoque do item herda o CMPM global atual
-- como ponto de partida; entradas futuras recalculam por empresa.
INSERT INTO "ItemCustoEmpresa" ("id", "empresaId", "itemId", "precoCusto", "updatedAt")
SELECT 'ice_' || e."empresaId" || '_' || i."id", e."empresaId", i."id", i."precoCusto", CURRENT_TIMESTAMP
FROM "Item" i
JOIN (SELECT DISTINCT "empresaId", "itemId" FROM "EstoqueItem") e ON e."itemId" = i."id"
WHERE i."precoCusto" IS NOT NULL
ON CONFLICT ("empresaId", "itemId") DO NOTHING;
