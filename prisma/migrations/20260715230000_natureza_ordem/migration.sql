-- Ordem manual (drag and drop, estilo Nibo) nas naturezas financeiras e nos
-- subgrupos. Backfill: rank alfabético dentro do bucket (empresa/grupo/subgrupo),
-- só nas linhas ainda sem ordem (0) — re-execução não mexe no que o usuário já
-- arrastou. Idempotente.

ALTER TABLE "NaturezaFinanceira" ADD COLUMN IF NOT EXISTS "ordem" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NaturezaSubgrupo"   ADD COLUMN IF NOT EXISTS "ordem" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "empresaId", grupo, COALESCE("subgrupoId", '')
    ORDER BY nome
  ) AS rn
  FROM "NaturezaFinanceira"
)
UPDATE "NaturezaFinanceira" n
SET "ordem" = ranked.rn
FROM ranked
WHERE ranked.id = n.id AND n."ordem" = 0;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "empresaId", grupo
    ORDER BY nome
  ) AS rn
  FROM "NaturezaSubgrupo"
)
UPDATE "NaturezaSubgrupo" s
SET "ordem" = ranked.rn
FROM ranked
WHERE ranked.id = s.id AND s."ordem" = 0;
