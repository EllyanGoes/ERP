-- Origem de lançamento para a depreciação do imobilizado. Idempotente.
ALTER TYPE "OrigemLancamento" ADD VALUE IF NOT EXISTS 'DEPRECIACAO';
