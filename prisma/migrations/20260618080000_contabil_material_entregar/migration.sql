-- Material a Entregar: receita diferida (reconhecida na entrega). Idempotente.
ALTER TYPE "OrigemLancamento" ADD VALUE IF NOT EXISTS 'RECEITA_ENTREGA';

-- 2.1.2 Material a Entregar (passivo circulante, sob 2.1), por empresa.
INSERT INTO "ContaContabil" ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId")
SELECT 'cc_'||p."empresaId"||'_2_1_2', p."empresaId", '2.1.2', 'Material a Entregar',
  'PASSIVO', 'CREDORA', 'ANALITICA', p."nivel" + 1, true, p."id"
FROM "ContaContabil" p WHERE p."codigo" = '2.1'
  AND NOT EXISTS (SELECT 1 FROM "ContaContabil" cc WHERE cc."empresaId"=p."empresaId" AND cc."codigo"='2.1.2')
ON CONFLICT ("empresaId","codigo") DO NOTHING;
