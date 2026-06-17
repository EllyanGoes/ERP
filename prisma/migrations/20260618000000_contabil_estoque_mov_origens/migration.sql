-- Origens de lançamento para os demais movimentos de estoque (go-forward):
-- produção, consumo/requisição, ajuste/inventário e transferência. Idempotente.
ALTER TYPE "OrigemLancamento" ADD VALUE IF NOT EXISTS 'ESTOQUE_PRODUCAO';
ALTER TYPE "OrigemLancamento" ADD VALUE IF NOT EXISTS 'ESTOQUE_CONSUMO';
ALTER TYPE "OrigemLancamento" ADD VALUE IF NOT EXISTS 'ESTOQUE_AJUSTE';
ALTER TYPE "OrigemLancamento" ADD VALUE IF NOT EXISTS 'ESTOQUE_TRANSFERENCIA';
