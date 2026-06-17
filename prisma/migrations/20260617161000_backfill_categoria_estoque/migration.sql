-- Backfill da categoria de estoque dos produtos existentes (roda em todo
-- ambiente no deploy). Idempotente: cada passo só toca itens ainda sem
-- categoria (categoriaEstoque IS NULL). A ordem importa — do sinal mais forte
-- ao mais fraco. Serviços ficam sem categoria (não têm estoque).
--
-- Heurística (espelha prisma/backfill-categoria-estoque.ts):
--   MATERIA_PRIMA                              → INSUMO
--   PRODUTO fabricado (engenharia/fluxo/ordem) → PRODUTO_ACABADO
--   PRODUTO vendável (restante)                → MERCADORIA
--   demais não-serviço                         → ALMOXARIFADO

UPDATE "Item"
  SET "categoriaEstoque" = 'INSUMO'
  WHERE "categoriaEstoque" IS NULL AND "tipo" = 'MATERIA_PRIMA';

UPDATE "Item"
  SET "categoriaEstoque" = 'PRODUTO_ACABADO'
  WHERE "categoriaEstoque" IS NULL
    AND "tipo" = 'PRODUTO'
    AND (
      "id" IN (SELECT "itemId" FROM "EngenhariaProduto")
      OR "id" IN (SELECT "itemId" FROM "FluxoProducao")
      OR "id" IN (SELECT "itemId" FROM "OrdemProducao")
    );

UPDATE "Item"
  SET "categoriaEstoque" = 'MERCADORIA'
  WHERE "categoriaEstoque" IS NULL
    AND "tipo" = 'PRODUTO'
    AND "vendavel" = true;

UPDATE "Item"
  SET "categoriaEstoque" = 'ALMOXARIFADO'
  WHERE "categoriaEstoque" IS NULL
    AND "tipo" <> 'SERVICO';
