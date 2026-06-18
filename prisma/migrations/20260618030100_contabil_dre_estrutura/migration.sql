-- Estrutura editável da DRE: seções (somam/subtraem) + atribuição/ordem das
-- contas de resultado. Seed das 3 seções padrão por empresa e atribuição das
-- contas analíticas de resultado pelo prefixo do código. Idempotente.

DO $$ BEGIN
  CREATE TYPE "DREOperacao" AS ENUM ('SOMA', 'SUBTRAI');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "DRESecao" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "nome" TEXT NOT NULL,
  "operacao" "DREOperacao" NOT NULL DEFAULT 'SOMA',
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DRESecao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DRESecao_empresaId_idx" ON "DRESecao"("empresaId");

ALTER TABLE "ContaContabil" ADD COLUMN IF NOT EXISTS "dreSecaoId" TEXT;
ALTER TABLE "ContaContabil" ADD COLUMN IF NOT EXISTS "ordemDre" INTEGER NOT NULL DEFAULT 0;

-- Seções padrão por empresa
INSERT INTO "DRESecao" ("id","empresaId","nome","operacao","ordem")
SELECT 'dre_'||e."id"||'_'||s.slug, e."id", s.nome, s.op::"DREOperacao", s.ordem
FROM "Empresa" e
CROSS JOIN (VALUES
  ('receitas', 'Receitas', 'SOMA', 1),
  ('custos',   'Custos',   'SUBTRAI', 2),
  ('despesas', 'Despesas', 'SUBTRAI', 3)
) AS s(slug, nome, op, ordem)
WHERE NOT EXISTS (SELECT 1 FROM "DRESecao" d WHERE d."empresaId"=e."id" AND d."nome"=s.nome);

-- Atribui as contas analíticas de resultado às seções pelo prefixo do código
UPDATE "ContaContabil" c
SET "dreSecaoId" = d."id"
FROM "DRESecao" d
WHERE d."empresaId" = c."empresaId" AND c."grupo"='RESULTADO' AND c."tipo"='ANALITICA' AND c."dreSecaoId" IS NULL
  AND ( (c."codigo" LIKE '3.1%' AND d."nome"='Receitas')
     OR (c."codigo" LIKE '3.2%' AND d."nome"='Custos')
     OR (c."codigo" LIKE '3.3%' AND d."nome"='Despesas') );

-- Ordem das contas dentro da seção (pela ordem do código)
WITH ord AS (
  SELECT "id", row_number() OVER (PARTITION BY "dreSecaoId" ORDER BY "codigo") AS rn
  FROM "ContaContabil" WHERE "dreSecaoId" IS NOT NULL
)
UPDATE "ContaContabil" c SET "ordemDre" = ord.rn FROM ord WHERE ord."id" = c."id";
