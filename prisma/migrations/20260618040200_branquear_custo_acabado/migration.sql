-- Branqueia o custo médio (CMPM) dos produtos de categoria Produto Acabado: o
-- custo real virá do PCP; por ora o estoque acabado é valorado pelo preço médio
-- de venda. Idempotente.

UPDATE "Item" SET "precoCusto" = NULL
WHERE "categoriaEstoque" = 'PRODUTO_ACABADO' AND "precoCusto" IS NOT NULL;

UPDATE "ItemCustoEmpresa" ice SET "precoCusto" = NULL
FROM "Item" i
WHERE ice."itemId" = i."id" AND i."categoriaEstoque" = 'PRODUTO_ACABADO' AND ice."precoCusto" IS NOT NULL;
