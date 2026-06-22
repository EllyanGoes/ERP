-- Nova categoria de estoque: RESIDUO_PRODUCAO (resíduos/sobras do processo, ex.: caco). Idempotente.
ALTER TYPE "CategoriaEstoque" ADD VALUE IF NOT EXISTS 'RESIDUO_PRODUCAO' BEFORE 'ALMOXARIFADO';
