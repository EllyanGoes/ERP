-- Crédito (vale) do cliente — gerado por devolução (crédito/troca), consumido
-- como forma de pagamento em vendas futuras. Idempotente.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StatusCreditoCliente') THEN
    CREATE TYPE "StatusCreditoCliente" AS ENUM ('ATIVO', 'USADO', 'CANCELADO');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CreditoCliente" (
  "id"                TEXT NOT NULL,
  "empresaId"         TEXT NOT NULL DEFAULT 'emp_tramontin',
  "numero"            TEXT NOT NULL,
  "clienteId"         TEXT NOT NULL,
  "origemDevolucaoId" TEXT,
  "valor"             DECIMAL(15,2) NOT NULL,
  "valorUsado"        DECIMAL(15,2) NOT NULL DEFAULT 0,
  "status"            "StatusCreditoCliente" NOT NULL DEFAULT 'ATIVO',
  "observacoes"       TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditoCliente_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CreditoCliente_empresaId_numero_key" ON "CreditoCliente"("empresaId", "numero");
CREATE INDEX IF NOT EXISTS "CreditoCliente_clienteId_idx" ON "CreditoCliente"("clienteId");
CREATE INDEX IF NOT EXISTS "CreditoCliente_status_idx" ON "CreditoCliente"("status");
