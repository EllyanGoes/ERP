-- Valor base da diária no cadastro do colaborador (pré-preenche o lançamento).
-- Migration idempotente (padrão do projeto — nunca db push em prod).
ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "valorDiaria" DECIMAL(15,2);
