-- Data de competência (regime de competência) nos títulos. Idempotente.
ALTER TABLE "ContaReceber" ADD COLUMN IF NOT EXISTS "dataCompetencia" TIMESTAMP(3);
ALTER TABLE "ContaPagar"   ADD COLUMN IF NOT EXISTS "dataCompetencia" TIMESTAMP(3);
-- Datas opcionais no lançamento de caixa (vencimento/competência) — mantém o
-- banco alinhado ao schema. Idempotente.
ALTER TABLE "LancamentoCaixa" ADD COLUMN IF NOT EXISTS "dataVencimento" TIMESTAMP(3);
ALTER TABLE "LancamentoCaixa" ADD COLUMN IF NOT EXISTS "dataCompetencia" TIMESTAMP(3);
