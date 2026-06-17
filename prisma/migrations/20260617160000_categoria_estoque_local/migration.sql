-- Categoria de estoque (natureza de armazenagem) do produto + categorias
-- aceitas por local de estoque. Amarra o produto ao(s) local(is) que o aceitam,
-- impedindo cadastro/movimentação de entrada em local errado (ex.: Tijolão e
-- Tijolinho — PRODUTO_ACABADO — não entram no Almoxarifado).
-- Idempotente: tipo e colunas só são criados se ainda não existirem.

DO $$ BEGIN
  CREATE TYPE "CategoriaEstoque" AS ENUM ('PRODUTO_ACABADO', 'MERCADORIA', 'WIP', 'INSUMO', 'ALMOXARIFADO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Natureza de armazenagem do produto (null = não classificado).
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "categoriaEstoque" "CategoriaEstoque";

-- Categorias que o local aceita. Vazio = aceita qualquer produto (legado).
ALTER TABLE "LocalEstoque"
  ADD COLUMN IF NOT EXISTS "categoriasAceitas" "CategoriaEstoque"[] NOT NULL DEFAULT ARRAY[]::"CategoriaEstoque"[];
