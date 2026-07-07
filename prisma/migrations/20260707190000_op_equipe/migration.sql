-- Equipe da OP: colaboradores que estavam na produção no dia (OP do dia, não
-- por pessoa). Idempotente, no padrão do projeto.
CREATE TABLE IF NOT EXISTS "OrdemProducaoEquipe" (
    "id" TEXT NOT NULL,
    "ordemProducaoId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    CONSTRAINT "OrdemProducaoEquipe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrdemProducaoEquipe_ordemProducaoId_colaboradorId_key"
    ON "OrdemProducaoEquipe"("ordemProducaoId", "colaboradorId");
CREATE INDEX IF NOT EXISTS "OrdemProducaoEquipe_colaboradorId_idx"
    ON "OrdemProducaoEquipe"("colaboradorId");

DO $$ BEGIN
    ALTER TABLE "OrdemProducaoEquipe" ADD CONSTRAINT "OrdemProducaoEquipe_ordemProducaoId_fkey"
        FOREIGN KEY ("ordemProducaoId") REFERENCES "OrdemProducao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "OrdemProducaoEquipe" ADD CONSTRAINT "OrdemProducaoEquipe_colaboradorId_fkey"
        FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
