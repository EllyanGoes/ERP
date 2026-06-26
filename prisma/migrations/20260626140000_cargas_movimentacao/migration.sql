-- Cargas de movimentação: capacidade por produto × veículo + veículo por etapa.
DO $$ BEGIN
  CREATE TYPE "VeiculoMovimentacao" AS ENUM ('VAGONETA', 'VAGAO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "ItemCargaVeiculo" (
  "id"         TEXT NOT NULL,
  "itemId"     TEXT NOT NULL,
  "veiculo"    "VeiculoMovimentacao" NOT NULL,
  "capacidade" INTEGER NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ItemCargaVeiculo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ItemCargaVeiculo_itemId_veiculo_key" ON "ItemCargaVeiculo"("itemId", "veiculo");
CREATE INDEX IF NOT EXISTS "ItemCargaVeiculo_itemId_idx" ON "ItemCargaVeiculo"("itemId");
DO $$ BEGIN
  ALTER TABLE "ItemCargaVeiculo" ADD CONSTRAINT "ItemCargaVeiculo_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "EtapaVeiculo" (
  "id"        TEXT NOT NULL,
  "etapa"     TEXT NOT NULL,
  "veiculo"   "VeiculoMovimentacao" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EtapaVeiculo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EtapaVeiculo_etapa_veiculo_key" ON "EtapaVeiculo"("etapa", "veiculo");
