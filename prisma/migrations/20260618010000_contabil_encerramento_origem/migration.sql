-- Origem de lançamento para o encerramento do exercício. Idempotente.
ALTER TYPE "OrigemLancamento" ADD VALUE IF NOT EXISTS 'ENCERRAMENTO';
