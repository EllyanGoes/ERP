-- Data de emissão do documento nos títulos (contas a pagar e a receber).
-- Idempotente (IF NOT EXISTS) — pode rodar em bases onde a coluna já exista.
ALTER TABLE "ContaPagar"   ADD COLUMN IF NOT EXISTS "dataEmissao" TIMESTAMP(3);
ALTER TABLE "ContaReceber" ADD COLUMN IF NOT EXISTS "dataEmissao" TIMESTAMP(3);
