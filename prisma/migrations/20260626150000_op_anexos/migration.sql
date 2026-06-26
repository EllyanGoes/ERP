-- Anexos da OP (OP escaneada/comprovação). Vercel Blob (url). Aditivo.
CREATE TABLE IF NOT EXISTS "OrdemProducaoAnexo" (
  "id"              TEXT NOT NULL,
  "ordemProducaoId" TEXT NOT NULL,
  "nome"            TEXT NOT NULL,
  "url"             TEXT NOT NULL,
  "tamanho"         INTEGER NOT NULL,
  "tipo"            TEXT NOT NULL,
  "criadoPor"       TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrdemProducaoAnexo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OrdemProducaoAnexo_ordemProducaoId_idx" ON "OrdemProducaoAnexo"("ordemProducaoId");
DO $$ BEGIN
  ALTER TABLE "OrdemProducaoAnexo" ADD CONSTRAINT "OrdemProducaoAnexo_ordemProducaoId_fkey"
    FOREIGN KEY ("ordemProducaoId") REFERENCES "OrdemProducao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
