-- Integra o grupo Resultado às Naturezas Financeiras (uma analítica por natureza
-- sob 3.1/3.2/3.3) e Estoques aos Locais de Estoque (uma analítica por local sob
-- 1.1.3). Por empresa. Idempotente.

ALTER TABLE "ContaContabil" ADD COLUMN IF NOT EXISTS "naturezaFinanceiraId" TEXT;
ALTER TABLE "ContaContabil" ADD COLUMN IF NOT EXISTS "localEstoqueId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ContaContabil_empresaId_naturezaFinanceiraId_key" ON "ContaContabil"("empresaId", "naturezaFinanceiraId");
CREATE UNIQUE INDEX IF NOT EXISTS "ContaContabil_empresaId_localEstoqueId_key" ON "ContaContabil"("empresaId", "localEstoqueId");

-- ── Backfill: analítica por NATUREZA sob o pai de Resultado mapeado ───────────
WITH nat AS (
  SELECT n."id" AS nat_id, n."empresaId", n."nome",
    CASE n."grupo"
      WHEN 'RECEITA_OPERACIONAL' THEN '3.1'
      WHEN 'CUSTO_OPERACIONAL'   THEN '3.2'
      WHEN 'DESPESA_OPERACIONAL' THEN '3.3'
      ELSE (CASE WHEN n."tipo"='ENTRADA' THEN '3.1' ELSE '3.3' END)
    END AS pai_cod
  FROM "NaturezaFinanceira" n
),
pai AS (
  SELECT c."empresaId", c."codigo" AS pai_cod, c."id" AS pai_id, c."nivel" AS pai_nivel, c."natureza" AS pai_nat
  FROM "ContaContabil" c WHERE c."codigo" IN ('3.1','3.2','3.3')
),
base AS (
  SELECT "paiId", COALESCE(MAX(CAST(split_part("codigo", '.', 3) AS INTEGER)), 0) AS maxnum
  FROM "ContaContabil" WHERE "codigo" ~ '^3\.[0-9]+\.[0-9]+$' GROUP BY "paiId"
)
INSERT INTO "ContaContabil" ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId","naturezaFinanceiraId")
SELECT 'cnat_'||nat.nat_id, nat."empresaId",
  p.pai_cod||'.'||lpad((COALESCE(b.maxnum, 0) + row_number() OVER (PARTITION BY p.pai_id ORDER BY nat."nome", nat.nat_id))::text, 4, '0'),
  nat."nome", 'RESULTADO', p.pai_nat, 'ANALITICA', p.pai_nivel + 1, true, p.pai_id, nat.nat_id
FROM nat
JOIN pai p ON p."empresaId"=nat."empresaId" AND p.pai_cod=nat.pai_cod
LEFT JOIN base b ON b."paiId"=p.pai_id
WHERE NOT EXISTS (SELECT 1 FROM "ContaContabil" cc WHERE cc."empresaId"=nat."empresaId" AND cc."naturezaFinanceiraId"=nat.nat_id)
ON CONFLICT ("empresaId","codigo") DO NOTHING;

-- ── Backfill: analítica por LOCAL DE ESTOQUE sob 1.1.3 ────────────────────────
WITH pai AS (
  SELECT c."empresaId", c."id" AS pai_id, c."codigo" AS pai_cod, c."nivel" AS pai_nivel
  FROM "ContaContabil" c WHERE c."codigo"='1.1.3'
),
base AS (
  SELECT "paiId", COALESCE(MAX(CAST(split_part("codigo", '.', 4) AS INTEGER)), 0) AS maxnum
  FROM "ContaContabil" WHERE "codigo" LIKE '1.1.3.%' GROUP BY "paiId"
)
INSERT INTO "ContaContabil" ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId","localEstoqueId")
SELECT 'cloc_'||l."id", p."empresaId",
  '1.1.3.'||lpad((COALESCE(b.maxnum, 0) + row_number() OVER (PARTITION BY p.pai_id ORDER BY l."nome", l."id"))::text, 4, '0'),
  l."nome", 'ATIVO', 'DEVEDORA', 'ANALITICA', p.pai_nivel + 1, true, p.pai_id, l."id"
FROM pai p
JOIN "LocalEstoque" l ON l."empresaId"=p."empresaId"
LEFT JOIN base b ON b."paiId"=p.pai_id
WHERE NOT EXISTS (SELECT 1 FROM "ContaContabil" cc WHERE cc."empresaId"=p."empresaId" AND cc."localEstoqueId"=l."id")
ON CONFLICT ("empresaId","codigo") DO NOTHING;
