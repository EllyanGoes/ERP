-- Ajustes por título na compensação (padrão TOTVS): juros, multa, desconto, acréscimo.
ALTER TABLE "CompensacaoItem" ADD COLUMN IF NOT EXISTS "juros" DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE "CompensacaoItem" ADD COLUMN IF NOT EXISTS "multa" DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE "CompensacaoItem" ADD COLUMN IF NOT EXISTS "desconto" DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE "CompensacaoItem" ADD COLUMN IF NOT EXISTS "acrescimo" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- Nova origem de lançamento para o ajuste (juros/multa/desconto) da compensação.
ALTER TYPE "OrigemLancamento" ADD VALUE IF NOT EXISTS 'COMPENSACAO_AJUSTE';
