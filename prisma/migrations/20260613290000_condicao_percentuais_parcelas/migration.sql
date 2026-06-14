-- Percentual por parcela (ex.: "50% na entrada" = 50/50). Quando preenchido,
-- cada parcela usa seu percentual do total em vez de divisão igual.
ALTER TABLE "CondicaoPagamento" ADD COLUMN IF NOT EXISTS "percentuaisParcelas" TEXT;
