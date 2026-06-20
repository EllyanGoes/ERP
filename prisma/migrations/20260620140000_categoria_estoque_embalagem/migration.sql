-- Nova categoria de estoque: EMBALAGEM (pallets, fitas, filmes…). Idempotente.
ALTER TYPE "CategoriaEstoque" ADD VALUE IF NOT EXISTS 'EMBALAGEM' BEFORE 'ALMOXARIFADO';
