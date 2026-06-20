-- Sessões/dispositivos logados (gestão de dispositivos da conta). Idempotente.
CREATE TABLE IF NOT EXISTS "UsuarioSessao" (
  "id"             TEXT NOT NULL,
  "usuarioId"      TEXT NOT NULL,
  "userAgent"      TEXT,
  "dispositivo"    TEXT,
  "navegador"      TEXT,
  "so"             TEXT,
  "ip"             TEXT,
  "criadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ultimoAcessoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiraEm"       TIMESTAMP(3) NOT NULL,
  "revogadoEm"     TIMESTAMP(3),
  CONSTRAINT "UsuarioSessao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UsuarioSessao_usuarioId_idx" ON "UsuarioSessao"("usuarioId");
CREATE INDEX IF NOT EXISTS "UsuarioSessao_revogadoEm_idx" ON "UsuarioSessao"("revogadoEm");

DO $$ BEGIN
  ALTER TABLE "UsuarioSessao" ADD CONSTRAINT "UsuarioSessao_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
