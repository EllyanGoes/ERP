-- CIF: dimensões de custeio na partida (estágio do WIP e natureza) + flag de natureza CIF.
-- Aditivo e idempotente. NÃO altera o plano de contas.

-- Natureza de Custo Indireto: o débito vai p/ "CIF a Apropriar" (1.1.4.0001).
ALTER TABLE "NaturezaFinanceira" ADD COLUMN IF NOT EXISTS "cif" BOOLEAN NOT NULL DEFAULT false;

-- Dimensões na partida (não são contas): estágio (EstadoWIP) e natureza.
ALTER TABLE "PartidaContabil" ADD COLUMN IF NOT EXISTS "estagio" "EstadoWIP";
ALTER TABLE "PartidaContabil" ADD COLUMN IF NOT EXISTS "naturezaFinanceiraId" TEXT;

DO $$ BEGIN
  ALTER TABLE "PartidaContabil"
    ADD CONSTRAINT "PartidaContabil_naturezaFinanceiraId_fkey"
    FOREIGN KEY ("naturezaFinanceiraId") REFERENCES "NaturezaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "PartidaContabil_naturezaFinanceiraId_idx" ON "PartidaContabil"("naturezaFinanceiraId");
CREATE INDEX IF NOT EXISTS "PartidaContabil_estagio_idx" ON "PartidaContabil"("estagio");
