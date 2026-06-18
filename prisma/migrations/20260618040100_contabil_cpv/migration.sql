-- Conta de CPV (Custo dos Produtos Vendidos) — baixa de estoque de produto
-- acabado (fabricado) na venda, separada do CMV (mercadoria comprada). Por
-- empresa. Idempotente.

INSERT INTO "ContaContabil"
  ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId")
SELECT 'csis_'||p."empresaId"||'_3_2_9003', p."empresaId", '3.2.9003', 'CPV — Custo dos Produtos Vendidos',
  'RESULTADO', p."natureza", 'ANALITICA', p."nivel" + 1, true, p."id"
FROM "ContaContabil" p WHERE p."codigo" = '3.2'
  AND NOT EXISTS (SELECT 1 FROM "ContaContabil" cc WHERE cc."empresaId"=p."empresaId" AND cc."codigo"='3.2.9003')
ON CONFLICT ("empresaId","codigo") DO NOTHING;
