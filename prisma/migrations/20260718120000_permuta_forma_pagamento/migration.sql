-- Permuta como FORMA de pagamento (meio de quitação — bens/serviços no lugar
-- de dinheiro, total ou parcial), distinta de condição (que estrutura o prazo):
--   1. novo tipo PERMUTA no enum de formas;
--   2. flag de conta transitória "Permutas a liquidar" na ContaBancaria
--      (análoga à `compensacao` do Encontro de Contas);
--   3. forma prevista no Documento de Entrada (ConferenciaCompra) e carimbo
--      nos títulos gerados (ContaPagar.formaPagamentoPrevistaId).
-- Idempotente. IMPORTANTE: nenhum DML aqui usa o valor novo do enum — no
-- Postgres um valor de enum criado na transação não pode ser usado nela;
-- o cadastro da forma "Permuta" é dado (feito via tela/SQL após o deploy).

ALTER TYPE "TipoFormaPagamento" ADD VALUE IF NOT EXISTS 'PERMUTA';

ALTER TABLE "ContaBancaria" ADD COLUMN IF NOT EXISTS "permuta" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ConferenciaCompra" ADD COLUMN IF NOT EXISTS "formaPagamentoId" TEXT;
DO $$ BEGIN
  ALTER TABLE "ConferenciaCompra" ADD CONSTRAINT "ConferenciaCompra_formaPagamentoId_fkey"
    FOREIGN KEY ("formaPagamentoId") REFERENCES "FormaPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "ContaPagar" ADD COLUMN IF NOT EXISTS "formaPagamentoPrevistaId" TEXT;
DO $$ BEGIN
  ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_formaPagamentoPrevistaId_fkey"
    FOREIGN KEY ("formaPagamentoPrevistaId") REFERENCES "FormaPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "ContaPagar_formaPagamentoPrevistaId_idx" ON "ContaPagar"("formaPagamentoPrevistaId");
