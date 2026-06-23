-- Vínculo opcional concorrente → cliente (concorrente que também é cliente). Idempotente.
ALTER TABLE "Concorrente" ADD COLUMN IF NOT EXISTS "clienteId" TEXT;
CREATE INDEX IF NOT EXISTS "Concorrente_clienteId_idx" ON "Concorrente"("clienteId");
