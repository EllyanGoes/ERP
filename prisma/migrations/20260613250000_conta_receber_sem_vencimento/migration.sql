-- "Faturado / a combinar": condição de pagamento sem data de vencimento prevista.
-- ContaReceber.dataVencimento passa a ser opcional (null = sem previsão).
-- Idempotente.

ALTER TABLE "CondicaoPagamento" ADD COLUMN IF NOT EXISTS "semVencimento" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ContaReceber" ALTER COLUMN "dataVencimento" DROP NOT NULL;

-- Marca as condições "Faturado" como sem vencimento previsto (ajustável depois).
UPDATE "CondicaoPagamento" SET "semVencimento" = true
WHERE "semVencimento" = false AND lower(btrim(nome)) IN ('faturado', 'a combinar', 'em aberto');
