-- Parcelamento configurável por dias específicos de vencimento (ex.: "15,30,45"
-- ou irregular "30,45,90"). Quando preenchido, define nº e prazos das parcelas.
ALTER TABLE "CondicaoPagamento" ADD COLUMN IF NOT EXISTS "diasParcelas" TEXT;
