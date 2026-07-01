-- Rateio de natureza no título a RECEBER (espelha ContaPagarNatureza).
CREATE TABLE IF NOT EXISTS "ContaReceberNatureza" (
  "id" TEXT NOT NULL,
  "contaReceberId" TEXT NOT NULL,
  "naturezaFinanceiraId" TEXT NOT NULL,
  "detalhamento" TEXT,
  "valor" DECIMAL(15,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContaReceberNatureza_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContaReceberNatureza_contaReceberId_idx" ON "ContaReceberNatureza"("contaReceberId");
CREATE INDEX IF NOT EXISTS "ContaReceberNatureza_naturezaFinanceiraId_idx" ON "ContaReceberNatureza"("naturezaFinanceiraId");
DO $$ BEGIN
  ALTER TABLE "ContaReceberNatureza" ADD CONSTRAINT "ContaReceberNatureza_contaReceberId_fkey"
    FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ContaReceberNatureza" ADD CONSTRAINT "ContaReceberNatureza_naturezaFinanceiraId_fkey"
    FOREIGN KEY ("naturezaFinanceiraId") REFERENCES "NaturezaFinanceira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
