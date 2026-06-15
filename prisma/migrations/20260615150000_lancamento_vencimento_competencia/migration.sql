-- Datas opcionais no lançamento de caixa (formulário rico): vencimento e
-- competência. A tabela do modelo LancamentoFinanceiro é "LancamentoCaixa".
-- Idempotente.
ALTER TABLE "LancamentoCaixa" ADD COLUMN IF NOT EXISTS "dataVencimento" TIMESTAMP(3);
ALTER TABLE "LancamentoCaixa" ADD COLUMN IF NOT EXISTS "dataCompetencia" TIMESTAMP(3);
