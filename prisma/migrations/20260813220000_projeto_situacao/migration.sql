-- Situação de andamento do projeto (badge/config): NAO_INICIADO |
-- EM_ANDAMENTO | PAUSADO | CONCLUIDO. Idempotente (padrão do projeto).
ALTER TABLE "Projeto" ADD COLUMN IF NOT EXISTS "situacao" TEXT NOT NULL DEFAULT 'EM_ANDAMENTO';
