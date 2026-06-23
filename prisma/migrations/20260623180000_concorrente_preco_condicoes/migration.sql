-- Preço de concorrente varia por condição de pagamento e modalidade (entrega/retirada). Idempotente.
ALTER TABLE "ConcorrentePreco" ADD COLUMN IF NOT EXISTS "condicaoPagamento" TEXT;
ALTER TABLE "ConcorrentePreco" ADD COLUMN IF NOT EXISTS "modalidade" TEXT;
