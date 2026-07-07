-- Colunas de horários da planilha de diárias no item (manhã/tarde/horas excedentes).
-- Migration idempotente (padrão do projeto — nunca db push em prod).
ALTER TABLE "DiariaItem" ADD COLUMN IF NOT EXISTS "manha" TEXT;
ALTER TABLE "DiariaItem" ADD COLUMN IF NOT EXISTS "tarde" TEXT;
ALTER TABLE "DiariaItem" ADD COLUMN IF NOT EXISTS "horasExcedente" TEXT;
