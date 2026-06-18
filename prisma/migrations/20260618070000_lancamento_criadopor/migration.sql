-- Usuário responsável dos lançamentos contábeis (manuais). Idempotente.
ALTER TABLE "LancamentoContabil" ADD COLUMN IF NOT EXISTS "criadoPor" TEXT;
