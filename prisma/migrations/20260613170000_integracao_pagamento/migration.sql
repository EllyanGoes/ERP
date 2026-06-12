-- Integração de pagamento (maquininha) por empresa do grupo: cada CNPJ tem a
-- própria conta na adquirente (ex.: Stone). accessToken é credencial secreta.
CREATE TABLE IF NOT EXISTS "IntegracaoPagamento" (
  "id"           TEXT NOT NULL,
  "empresaId"    TEXT NOT NULL,
  "provedor"     TEXT NOT NULL DEFAULT 'STONE',
  "ambiente"     TEXT NOT NULL DEFAULT 'PRODUCAO',
  "accessToken"  TEXT,
  "pontoVendaId" TEXT,
  "ativo"        BOOLEAN NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegracaoPagamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IntegracaoPagamento_empresaId_provedor_key"
  ON "IntegracaoPagamento"("empresaId", "provedor");
CREATE INDEX IF NOT EXISTS "IntegracaoPagamento_empresaId_idx"
  ON "IntegracaoPagamento"("empresaId");

DO $do$ BEGIN
  ALTER TABLE "IntegracaoPagamento"
    ADD CONSTRAINT "IntegracaoPagamento_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
