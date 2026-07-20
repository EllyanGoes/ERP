-- TES → natureza financeira sugerida: o TES já diz "o que foi comprado"
-- (TES-E05 MRO → 2.04 Material de manutenção); o título gerado pelo DE nasce
-- pré-classificado. Sugestão é default, não trava — o usuário troca no título.
-- Seed por CÓDIGO (TES × natureza do plano hierárquico), por empresa, só onde
-- ainda não há sugestão. Empresa sem plano com código (ex.: CMB) fica intacta.
-- Idempotente.

ALTER TABLE "TipoOperacao" ADD COLUMN IF NOT EXISTS "naturezaSugeridaId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TipoOperacao_naturezaSugeridaId_fkey') THEN
    ALTER TABLE "TipoOperacao"
      ADD CONSTRAINT "TipoOperacao_naturezaSugeridaId_fkey"
      FOREIGN KEY ("naturezaSugeridaId") REFERENCES "NaturezaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TipoOperacao_naturezaSugeridaId_idx" ON "TipoOperacao"("naturezaSugeridaId");

-- Seed das sugestões nos TES existentes (mapa TES padrão → código do plano):
--   TES-E01 Matéria-Prima → 2.01 · TES-E02 Insumos (queima) → 2.02
--   TES-E03 Combustível  → 2.03 · TES-E04 Embalagem        → 2.07
--   TES-E05 Manutenção/MRO → 2.04 · TES-E06 Revenda        → 2.08
--   TES-E07 Imobilizado  → 7.01 · TES-E08 Uso e Consumo    → 2.05
-- TES sem correspondência clara (ex.: TES-E09 Serviço) ficam sem sugestão.
UPDATE "TipoOperacao" t
SET "naturezaSugeridaId" = n.id
FROM (VALUES
  ('TES-E01', '2.01'),
  ('TES-E02', '2.02'),
  ('TES-E03', '2.03'),
  ('TES-E04', '2.07'),
  ('TES-E05', '2.04'),
  ('TES-E06', '2.08'),
  ('TES-E07', '7.01'),
  ('TES-E08', '2.05')
) AS mapa(tes_codigo, nat_codigo)
JOIN "NaturezaFinanceira" n
  ON n."codigo" = mapa.nat_codigo AND n."ativo" = true
WHERE t."codigo" = mapa.tes_codigo
  AND t."empresaId" = n."empresaId"
  AND t."naturezaSugeridaId" IS NULL;
