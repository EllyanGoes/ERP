-- Notificações in-app + solicitante na aprovação (idempotente).
CREATE TABLE IF NOT EXISTS "Notificacao" (
  "id" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "mensagem" TEXT NOT NULL,
  "link" TEXT,
  "lida" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Notificacao_usuarioId_lida_idx" ON "Notificacao"("usuarioId", "lida");
CREATE INDEX IF NOT EXISTS "Notificacao_usuarioId_createdAt_idx" ON "Notificacao"("usuarioId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "Notificacao"
    ADD CONSTRAINT "Notificacao_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AprovacaoSC" ADD COLUMN IF NOT EXISTS "solicitadoPor" TEXT;
