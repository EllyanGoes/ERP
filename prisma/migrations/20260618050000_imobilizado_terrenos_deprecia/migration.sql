-- Imobilizado: bens não depreciáveis (terrenos) + conta 1.2.3 Terrenos. Idempotente.

ALTER TABLE "Imobilizado" ADD COLUMN IF NOT EXISTS "deprecia" BOOLEAN NOT NULL DEFAULT true;

-- 1.2.3 Terrenos (sintética, sob 1.2 Ativo Não Circulante) — bens que não depreciam.
INSERT INTO "ContaContabil" ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId")
SELECT 'cc_'||p."empresaId"||'_1_2_3', p."empresaId", '1.2.3', 'Terrenos',
  'ATIVO', 'DEVEDORA', 'SINTETICA', p."nivel" + 1, false, p."id"
FROM "ContaContabil" p WHERE p."codigo" = '1.2'
  AND NOT EXISTS (SELECT 1 FROM "ContaContabil" cc WHERE cc."empresaId"=p."empresaId" AND cc."codigo"='1.2.3')
ON CONFLICT ("empresaId","codigo") DO NOTHING;
