-- Link público da OS (WhatsApp p/ mecânicos): código aleatório por OS, gerado sob demanda. Idempotente.
ALTER TABLE "ManutOrdem" ADD COLUMN IF NOT EXISTS "linkToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ManutOrdem_linkToken_key" ON "ManutOrdem"("linkToken");
