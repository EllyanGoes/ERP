-- Contas de resultado dedicadas (analíticas .9xxx) para fatos que caíam nas
-- sintéticas 3.1/3.2/3.3 — assim o Balanço (que só soma analíticas) as enxerga.
-- 3.1.9002 Receita de Vendas (sem natureza) · 3.2.9002 CMV · 3.3.9004 Despesas Gerais
-- Por empresa. Idempotente.

INSERT INTO "ContaContabil"
  ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId")
SELECT
  'csis_'||p."empresaId"||'_'||replace(novo.codigo, '.', '_'),
  p."empresaId", novo.codigo, novo.nome,
  'RESULTADO', p."natureza", 'ANALITICA', p."nivel" + 1, true, p."id"
FROM (VALUES
  ('3.1', '3.1.9002', 'Receita de Vendas'),
  ('3.2', '3.2.9002', 'CMV — Custo das Mercadorias Vendidas'),
  ('3.3', '3.3.9004', 'Despesas Gerais')
) AS novo(pai_cod, codigo, nome)
JOIN "ContaContabil" p ON p."codigo" = novo.pai_cod
WHERE NOT EXISTS (
  SELECT 1 FROM "ContaContabil" cc
  WHERE cc."empresaId" = p."empresaId" AND cc."codigo" = novo.codigo
)
ON CONFLICT ("empresaId","codigo") DO NOTHING;
