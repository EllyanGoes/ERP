-- Devolução de venda (estorno / crédito / troca). Idempotente.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoResolucaoDevolucao') THEN
    CREATE TYPE "TipoResolucaoDevolucao" AS ENUM ('ESTORNO', 'CREDITO', 'TROCA');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StatusDevolucao') THEN
    CREATE TYPE "StatusDevolucao" AS ENUM ('CONCLUIDA', 'CANCELADA');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Devolucao" (
  "id"              TEXT NOT NULL,
  "empresaId"       TEXT NOT NULL DEFAULT 'emp_tramontin',
  "numero"          TEXT NOT NULL,
  "pedidoVendaId"   TEXT NOT NULL,
  "clienteId"       TEXT NOT NULL,
  "data"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valorTotal"      DECIMAL(15,2) NOT NULL,
  "tipoResolucao"   "TipoResolucaoDevolucao" NOT NULL,
  "status"          "StatusDevolucao" NOT NULL DEFAULT 'CONCLUIDA',
  "contaBancariaId" TEXT,
  "pedidoTrocaId"   TEXT,
  "observacoes"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Devolucao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Devolucao_empresaId_numero_key" ON "Devolucao"("empresaId", "numero");
CREATE INDEX IF NOT EXISTS "Devolucao_pedidoVendaId_idx" ON "Devolucao"("pedidoVendaId");
CREATE INDEX IF NOT EXISTS "Devolucao_clienteId_idx" ON "Devolucao"("clienteId");

CREATE TABLE IF NOT EXISTS "DevolucaoItem" (
  "id"                TEXT NOT NULL,
  "devolucaoId"       TEXT NOT NULL,
  "pedidoVendaItemId" TEXT NOT NULL,
  "itemId"            TEXT NOT NULL,
  "quantidade"        DECIMAL(15,3) NOT NULL,
  "valorUnitario"     DECIMAL(15,2) NOT NULL,
  "valorTotal"        DECIMAL(15,2) NOT NULL,
  CONSTRAINT "DevolucaoItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DevolucaoItem_devolucaoId_idx" ON "DevolucaoItem"("devolucaoId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'DevolucaoItem_devolucaoId_fkey') THEN
    ALTER TABLE "DevolucaoItem" ADD CONSTRAINT "DevolucaoItem_devolucaoId_fkey"
      FOREIGN KEY ("devolucaoId") REFERENCES "Devolucao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "MovimentacaoEstoque" ADD COLUMN IF NOT EXISTS "devolucaoId" TEXT;
CREATE INDEX IF NOT EXISTS "MovimentacaoEstoque_devolucaoId_idx" ON "MovimentacaoEstoque"("devolucaoId");
