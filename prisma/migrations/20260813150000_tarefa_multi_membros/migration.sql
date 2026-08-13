-- Vários responsáveis por tarefa (TarefaMembro N:N); migra o responsável único
CREATE TABLE IF NOT EXISTS "TarefaMembro" (
    "tarefaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    CONSTRAINT "TarefaMembro_pkey" PRIMARY KEY ("tarefaId", "usuarioId")
);
CREATE INDEX IF NOT EXISTS "TarefaMembro_usuarioId_idx" ON "TarefaMembro"("usuarioId");
DO $$ BEGIN ALTER TABLE "TarefaMembro" ADD CONSTRAINT "TarefaMembro_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "Tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TarefaMembro" ADD CONSTRAINT "TarefaMembro_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Backfill: responsável único vira membro
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Tarefa' AND column_name = 'responsavelId') THEN
    INSERT INTO "TarefaMembro" ("tarefaId", "usuarioId")
      SELECT id, "responsavelId" FROM "Tarefa" WHERE "responsavelId" IS NOT NULL
      ON CONFLICT DO NOTHING;
  END IF;
END $$;

ALTER TABLE "Tarefa" DROP COLUMN IF EXISTS "responsavelId";
