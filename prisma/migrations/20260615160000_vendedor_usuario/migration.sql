-- Vínculo opcional Vendedor ↔ Usuário: quando o usuário cria um pedido de
-- venda, o vendedor é puxado automaticamente. Idempotente.
ALTER TABLE "Vendedor" ADD COLUMN IF NOT EXISTS "usuarioId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Vendedor_usuarioId_key" ON "Vendedor"("usuarioId");

DO $do$ BEGIN
  ALTER TABLE "Vendedor"
    ADD CONSTRAINT "Vendedor_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $do$;
