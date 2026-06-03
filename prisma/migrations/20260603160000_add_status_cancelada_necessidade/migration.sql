-- Adiciona o status CANCELADA à StatusNecessidade (soft-cancel de SC com motivo).
-- IF NOT EXISTS torna o passo idempotente. As colunas abaixo não usam o novo valor
-- de enum, então podem ser criadas na mesma migração sem o erro "unsafe use of new
-- value" do Postgres.
ALTER TYPE "StatusNecessidade" ADD VALUE IF NOT EXISTS 'CANCELADA';

-- Guarda o motivo e a data do cancelamento (ambas opcionais; SCs existentes ficam NULL).
ALTER TABLE "NecessidadeCompra" ADD COLUMN IF NOT EXISTS "motivoCancelamento" TEXT;
ALTER TABLE "NecessidadeCompra" ADD COLUMN IF NOT EXISTS "dataCancelamento" TIMESTAMP(3);
