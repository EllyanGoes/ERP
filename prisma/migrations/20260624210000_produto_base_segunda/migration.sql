-- Item de segunda qualidade aponta para o produto base (mesma engenharia/custo).
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "produtoBaseId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Item" ADD CONSTRAINT "Item_produtoBaseId_fkey"
    FOREIGN KEY ("produtoBaseId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Item_produtoBaseId_idx" ON "Item"("produtoBaseId");
