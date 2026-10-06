-- Dependências entre tarefas + configuração do cronograma. Idempotente.
ALTER TABLE "Projeto" ADD COLUMN IF NOT EXISTS "cronograma" JSONB;

CREATE TABLE IF NOT EXISTS "TarefaDependencia" (
  "id"          TEXT NOT NULL,
  "projetoId"   TEXT NOT NULL,
  "tarefaId"    TEXT NOT NULL,
  "dependeDeId" TEXT NOT NULL,
  CONSTRAINT "TarefaDependencia_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TarefaDependencia_tarefaId_dependeDeId_key" ON "TarefaDependencia"("tarefaId", "dependeDeId");
CREATE INDEX IF NOT EXISTS "TarefaDependencia_projetoId_idx" ON "TarefaDependencia"("projetoId");
CREATE INDEX IF NOT EXISTS "TarefaDependencia_dependeDeId_idx" ON "TarefaDependencia"("dependeDeId");

DO $$ BEGIN
  ALTER TABLE "TarefaDependencia" ADD CONSTRAINT "TarefaDependencia_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "TarefaDependencia" ADD CONSTRAINT "TarefaDependencia_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "Tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "TarefaDependencia" ADD CONSTRAINT "TarefaDependencia_dependeDeId_fkey" FOREIGN KEY ("dependeDeId") REFERENCES "Tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
