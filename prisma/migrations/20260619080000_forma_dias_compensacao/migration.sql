-- Dias de compensação por forma de pagamento (cartão de crédito = a receber +N dias). Idempotente.
ALTER TABLE "FormaPagamento" ADD COLUMN IF NOT EXISTS "diasCompensacao" integer NOT NULL DEFAULT 0;
