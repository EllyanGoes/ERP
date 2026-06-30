-- Unidade MI (Milheiro) + vínculo nos produtos BV (tijolos), 1 MI = 1000 UN.
-- Backfill de dados, idempotente. Permite informar o preço do concorrente por
-- milheiro na Inteligência Comercial (e a unidade fica disponível no cadastro do BV).

-- 1) Unidade MI (sigla é única).
INSERT INTO "Unidade" (id, nome, sigla, ativo, "createdAt", "updatedAt")
VALUES ('unidade_mi', 'Milheiro', 'MI', true, now(), now())
ON CONFLICT (sigla) DO NOTHING;

-- 2) Vincula MI a cada produto BV (fator 1000, base = unidade principal do item).
INSERT INTO "ItemUnidade" (id, "itemId", "unidadeId", "fatorConversao", "isPrincipal", "baseUnidadeId", "createdAt")
SELECT 'iu_' || replace(gen_random_uuid()::text, '-', ''), i.id, u.id, 1000, false, i."unidadeId", now()
FROM "Item" i
CROSS JOIN "Unidade" u
WHERE u.sigla = 'MI'
  AND (i.codigo ILIKE 'BV%' OR i.descricao ILIKE 'BV %')
ON CONFLICT ("itemId", "unidadeId") DO NOTHING;
