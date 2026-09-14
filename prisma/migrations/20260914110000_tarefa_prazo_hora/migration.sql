-- Hora do prazo da tarefa ("HH:MM", null = dia inteiro). Idempotente.
ALTER TABLE "Tarefa" ADD COLUMN IF NOT EXISTS "prazoHora" TEXT;
