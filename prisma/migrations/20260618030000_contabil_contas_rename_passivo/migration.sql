-- Renomeia Clientes→Clientes a Receber e Fornecedores→Fornecedores a Pagar, e
-- cria o grupo Passivo Não Circulante (2.2). Por empresa. Idempotente.

UPDATE "ContaContabil" SET "nome" = 'Clientes a Receber'   WHERE "codigo" = '1.1.2' AND "nome" <> 'Clientes a Receber';
UPDATE "ContaContabil" SET "nome" = 'Fornecedores a Pagar' WHERE "codigo" = '2.1.1' AND "nome" <> 'Fornecedores a Pagar';

-- 2.2 Passivo Não Circulante (sintética, sob o grupo raiz '2')
INSERT INTO "ContaContabil" ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId")
SELECT 'cc_'||r."empresaId"||'_2_2', r."empresaId", '2.2', 'Passivo Não Circulante',
  'PASSIVO', 'CREDORA', 'SINTETICA', r."nivel" + 1, false, r."id"
FROM "ContaContabil" r WHERE r."codigo" = '2'
  AND NOT EXISTS (SELECT 1 FROM "ContaContabil" cc WHERE cc."empresaId"=r."empresaId" AND cc."codigo"='2.2')
ON CONFLICT ("empresaId","codigo") DO NOTHING;

-- 2.2.1 Empréstimos e Financiamentos (analítica, sob 2.2)
INSERT INTO "ContaContabil" ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId")
SELECT 'cc_'||p."empresaId"||'_2_2_1', p."empresaId", '2.2.1', 'Empréstimos e Financiamentos',
  'PASSIVO', 'CREDORA', 'ANALITICA', p."nivel" + 1, true, p."id"
FROM "ContaContabil" p WHERE p."codigo" = '2.2'
  AND NOT EXISTS (SELECT 1 FROM "ContaContabil" cc WHERE cc."empresaId"=p."empresaId" AND cc."codigo"='2.2.1')
ON CONFLICT ("empresaId","codigo") DO NOTHING;
