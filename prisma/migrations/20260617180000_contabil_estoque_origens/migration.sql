-- Novas origens de lançamento contábil para estoque/CMV (inventário perpétuo).
-- Idempotente.
ALTER TYPE "OrigemLancamento" ADD VALUE IF NOT EXISTS 'ESTOQUE_ENTRADA';
ALTER TYPE "OrigemLancamento" ADD VALUE IF NOT EXISTS 'ESTOQUE_SAIDA';
