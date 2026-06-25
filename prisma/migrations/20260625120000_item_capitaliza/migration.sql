-- Flag "capitaliza" no Item: item que vai ao Imobilizado (não é consumo, é investimento).
-- Aditivo, default false — não altera comportamento dos registros existentes.
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "capitaliza" BOOLEAN NOT NULL DEFAULT false;
