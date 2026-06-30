-- Rateio gerencial de um título a pagar por natureza financeira (definido na baixa).
-- Não cria títulos separados; é dimensão/classificação. Idempotente.
CREATE TABLE IF NOT EXISTS "ContaPagarNatureza" (
  "id"                   TEXT NOT NULL,
  "contaPagarId"         TEXT NOT NULL,
  "naturezaFinanceiraId" TEXT NOT NULL,
  "detalhamento"         TEXT,
  "valor"                DECIMAL(15,2) NOT NULL,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContaPagarNatureza_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContaPagarNatureza_contaPagarId_idx" ON "ContaPagarNatureza"("contaPagarId");
CREATE INDEX IF NOT EXISTS "ContaPagarNatureza_naturezaFinanceiraId_idx" ON "ContaPagarNatureza"("naturezaFinanceiraId");

DO $$ BEGIN
  ALTER TABLE "ContaPagarNatureza"
    ADD CONSTRAINT "ContaPagarNatureza_contaPagarId_fkey"
    FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContaPagarNatureza"
    ADD CONSTRAINT "ContaPagarNatureza_naturezaFinanceiraId_fkey"
    FOREIGN KEY ("naturezaFinanceiraId") REFERENCES "NaturezaFinanceira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
