-- GHE como campo próprio da função (antes só no nome "Cargo — GHE ...").
ALTER TABLE "SstFuncao" ADD COLUMN IF NOT EXISTS "ghe" TEXT;
UPDATE "SstFuncao" SET "ghe" = trim(split_part("nome", ' — ', 2))
WHERE "ghe" IS NULL AND position(' — ' in "nome") > 0;
CREATE INDEX IF NOT EXISTS "SstFuncao_empresaId_ghe_idx" ON "SstFuncao"("empresaId", "ghe");
