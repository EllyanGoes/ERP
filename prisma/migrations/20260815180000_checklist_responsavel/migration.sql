-- Responsável por item do checklist (projetos): avatar/picker por item no
-- cartão. Idempotente (padrão do projeto).
ALTER TABLE "TarefaChecklistItem" ADD COLUMN IF NOT EXISTS "responsavelId" TEXT;
DO $$ BEGIN ALTER TABLE "TarefaChecklistItem" ADD CONSTRAINT "TarefaChecklistItem_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "TarefaChecklistItem_responsavelId_idx" ON "TarefaChecklistItem"("responsavelId");
