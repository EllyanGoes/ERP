-- Ordem manual das tarefas no cronograma. Idempotente.
ALTER TABLE "Tarefa" ADD COLUMN IF NOT EXISTS "ordemCronograma" INTEGER;
