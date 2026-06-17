-- Chão de fábrica (PCP): estado de WIP no estoque + meta de produção diária.
-- Idempotente.

-- 1) Dimensão de estado (WIP) no saldo de estoque. A fase é o LOCAL; este campo
--    rotula o estado e alimenta a conversão entre fases.
ALTER TABLE "EstoqueItem" ADD COLUMN IF NOT EXISTS "estadoWip" "EstadoWIP";
CREATE INDEX IF NOT EXISTS "EstoqueItem_estadoWip_idx" ON "EstoqueItem"("estadoWip");

-- 2) Origem da meta diária.
DO $$ BEGIN
  CREATE TYPE "OrigemMetaDiaria" AS ENUM ('MANUAL', 'MPS');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3) Meta de produção do dia por produto.
CREATE TABLE IF NOT EXISTS "MetaProducaoDiaria" (
  "id"         TEXT NOT NULL,
  "empresaId"  TEXT NOT NULL DEFAULT 'emp_tramontin',
  "itemId"     TEXT NOT NULL,
  "data"       DATE NOT NULL,
  "quantidade" DECIMAL(15,3) NOT NULL,
  "origem"     "OrigemMetaDiaria" NOT NULL DEFAULT 'MANUAL',
  "observacao" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetaProducaoDiaria_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MetaProducaoDiaria_empresaId_itemId_data_key" ON "MetaProducaoDiaria"("empresaId", "itemId", "data");
CREATE INDEX IF NOT EXISTS "MetaProducaoDiaria_data_idx" ON "MetaProducaoDiaria"("data");
CREATE INDEX IF NOT EXISTS "MetaProducaoDiaria_itemId_idx" ON "MetaProducaoDiaria"("itemId");
CREATE INDEX IF NOT EXISTS "MetaProducaoDiaria_empresaId_idx" ON "MetaProducaoDiaria"("empresaId");

DO $$ BEGIN
  ALTER TABLE "MetaProducaoDiaria" ADD CONSTRAINT "MetaProducaoDiaria_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "MetaProducaoDiaria" ADD CONSTRAINT "MetaProducaoDiaria_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
