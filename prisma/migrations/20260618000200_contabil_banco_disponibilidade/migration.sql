-- Liga cada Conta Bancária a uma analítica de disponibilidade sob 1.1.1
-- (Caixa e Bancos), por empresa. Idempotente.

ALTER TABLE "ContaContabil" ADD COLUMN IF NOT EXISTS "contaBancariaId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ContaContabil_empresaId_contaBancariaId_key" ON "ContaContabil"("empresaId", "contaBancariaId");

-- ── Backfill: analítica por CONTA BANCÁRIA sob 1.1.1 ──────────────────────────
WITH pai AS (
  SELECT c."empresaId", c."id" AS pai_id, c."nivel" AS pai_nivel
  FROM "ContaContabil" c WHERE c."codigo"='1.1.1'
),
base AS (
  SELECT "paiId", COALESCE(MAX(CAST(split_part("codigo", '.', 4) AS INTEGER)), 0) AS maxnum
  FROM "ContaContabil" WHERE "codigo" LIKE '1.1.1.%' GROUP BY "paiId"
)
INSERT INTO "ContaContabil" ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId","contaBancariaId")
SELECT 'cbanco_'||cb."id", p."empresaId",
  '1.1.1.'||lpad((COALESCE(b.maxnum, 0) + row_number() OVER (PARTITION BY p.pai_id ORDER BY cb."nome", cb."id"))::text, 4, '0'),
  COALESCE(bk."nome" || ' — ', '') || cb."nome",
  'ATIVO', 'DEVEDORA', 'ANALITICA', p.pai_nivel + 1, true, p.pai_id, cb."id"
FROM pai p
JOIN "ContaBancaria" cb ON cb."empresaId"=p."empresaId"
LEFT JOIN "Banco" bk ON bk."id"=cb."bancoId"
LEFT JOIN base b ON b."paiId"=p.pai_id
WHERE NOT EXISTS (SELECT 1 FROM "ContaContabil" cc WHERE cc."empresaId"=p."empresaId" AND cc."contaBancariaId"=cb."id")
ON CONFLICT ("empresaId","codigo") DO NOTHING;
