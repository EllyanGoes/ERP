-- Novas categorias de estoque: divide INSUMO em MATERIA_PRIMA + INSUMO (queima),
-- e adiciona COMBUSTIVEL e FERRAMENTAS. Mais o campo Item.consumivel.
-- Tudo idempotente (ADD VALUE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
ALTER TYPE "CategoriaEstoque" ADD VALUE IF NOT EXISTS 'MATERIA_PRIMA' BEFORE 'INSUMO';
ALTER TYPE "CategoriaEstoque" ADD VALUE IF NOT EXISTS 'COMBUSTIVEL' AFTER 'INSUMO';
ALTER TYPE "CategoriaEstoque" ADD VALUE IF NOT EXISTS 'FERRAMENTAS' BEFORE 'ALMOXARIFADO';

-- Consumível (default true): ferramentas serão marcadas como não-consumíveis.
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "consumivel" BOOLEAN NOT NULL DEFAULT true;
