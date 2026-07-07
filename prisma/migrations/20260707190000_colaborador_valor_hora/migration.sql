-- Cadastro do colaborador passa de "valor da diária" para "valor da HORA".
-- Migration idempotente (padrão do projeto — nunca db push em prod).
-- O UPDATE de conversão (diária ÷ 8h) roda só junto do RENAME: numa segunda
-- execução o RENAME lança undefined_column e o bloco inteiro é pulado.
DO $$ BEGIN
  ALTER TABLE "Colaborador" RENAME COLUMN "valorDiaria" TO "valorHora";
  UPDATE "Colaborador" SET "valorHora" = ROUND("valorHora" / 8, 2) WHERE "valorHora" IS NOT NULL;
EXCEPTION WHEN undefined_column THEN null; END $$;

-- Base nova (sem a coluna antiga): garante a coluna.
ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "valorHora" DECIMAL(15,2);
