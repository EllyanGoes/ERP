-- EPI com vários tamanhos: um EPI (um CA) ligado a vários itens de estoque.
CREATE TABLE IF NOT EXISTS "SstEpiItem" (
  "id" TEXT NOT NULL,
  "epiId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "tamanho" TEXT,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SstEpiItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SstEpiItem_epiId_itemId_key" ON "SstEpiItem"("epiId", "itemId");
CREATE INDEX IF NOT EXISTS "SstEpiItem_itemId_idx" ON "SstEpiItem"("itemId");
DO $$ BEGIN
  ALTER TABLE "SstEpiItem" ADD CONSTRAINT "SstEpiItem_epiId_fkey" FOREIGN KEY ("epiId") REFERENCES "SstEpi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "SstEpiItem" ADD CONSTRAINT "SstEpiItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "SstEpiEntrega" ADD COLUMN IF NOT EXISTS "tamanho" TEXT;
ALTER TABLE "SstEpiEntrega" ADD COLUMN IF NOT EXISTS "itemId" TEXT;

-- O item único de hoje vira o 1º "tamanho" (sem rótulo).
INSERT INTO "SstEpiItem" ("id", "epiId", "itemId", "ordem")
SELECT 'sstei_' || substr(md5(e.id || e."itemId"), 1, 20), e.id, e."itemId", 0
FROM "SstEpi" e WHERE e."itemId" IS NOT NULL
ON CONFLICT ("epiId", "itemId") DO NOTHING;

-- Entregas antigas com saída de estoque: grava o item baixado.
UPDATE "SstEpiEntrega" en SET "itemId" = m."itemId"
FROM "MovimentacaoEstoque" m
WHERE en."itemId" IS NULL AND en."movimentacaoEstoqueId" = m.id;
