-- Caixa de entrada pessoal de tarefas (Projetos, estilo Things 3). Idempotente.
CREATE TABLE IF NOT EXISTS "TarefaInbox" (
  "id"          TEXT NOT NULL,
  "usuarioId"   TEXT NOT NULL,
  "titulo"      TEXT NOT NULL,
  "notas"       TEXT,
  "ordem"       INTEGER NOT NULL DEFAULT 0,
  "concluidaEm" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TarefaInbox_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TarefaInbox_usuarioId_concluidaEm_idx" ON "TarefaInbox"("usuarioId", "concluidaEm");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TarefaInbox_usuarioId_fkey') THEN
    ALTER TABLE "TarefaInbox" ADD CONSTRAINT "TarefaInbox_usuarioId_fkey"
      FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
