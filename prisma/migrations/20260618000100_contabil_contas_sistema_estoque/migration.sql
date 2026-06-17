-- Contas de sistema (analíticas com código reservado .9xxx) para os movimentos
-- de estoque não-comerciais. Uma por empresa, sob o pai de Resultado. Idempotente.
-- 3.1.9001 Sobras de Estoque · 3.2.9001 Custo de Produção
-- 3.3.9001 Consumo de Materiais · 3.3.9002 Perdas de Estoque

INSERT INTO "ContaContabil"
  ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId")
SELECT
  'csis_'||p."empresaId"||'_'||replace(novo.codigo, '.', '_'),
  p."empresaId", novo.codigo, novo.nome,
  'RESULTADO', p."natureza", 'ANALITICA', p."nivel" + 1, true, p."id"
FROM (VALUES
  ('3.1', '3.1.9001', 'Sobras de Estoque'),
  ('3.2', '3.2.9001', 'Custo de Produção'),
  ('3.3', '3.3.9001', 'Consumo de Materiais'),
  ('3.3', '3.3.9002', 'Perdas de Estoque')
) AS novo(pai_cod, codigo, nome)
JOIN "ContaContabil" p ON p."codigo" = novo.pai_cod
WHERE NOT EXISTS (
  SELECT 1 FROM "ContaContabil" cc
  WHERE cc."empresaId" = p."empresaId" AND cc."codigo" = novo.codigo
)
ON CONFLICT ("empresaId","codigo") DO NOTHING;
