-- Anexos dos títulos financeiros (ContaPagar/ContaReceber): fatura, boleto,
-- comprovante… — arquivos no Vercel Blob, um registro por arquivo.
-- Idempotente (padrão do projeto): IF NOT EXISTS + FKs guardadas.

CREATE TABLE IF NOT EXISTS "AnexoTitulo" (
    "id" TEXT NOT NULL,
    "contaPagarId" TEXT,
    "contaReceberId" TEXT,
    "nome" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnexoTitulo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AnexoTitulo_contaPagarId_idx" ON "AnexoTitulo"("contaPagarId");
CREATE INDEX IF NOT EXISTS "AnexoTitulo_contaReceberId_idx" ON "AnexoTitulo"("contaReceberId");

DO $$ BEGIN
  ALTER TABLE "AnexoTitulo" ADD CONSTRAINT "AnexoTitulo_contaPagarId_fkey"
    FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "AnexoTitulo" ADD CONSTRAINT "AnexoTitulo_contaReceberId_fkey"
    FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
