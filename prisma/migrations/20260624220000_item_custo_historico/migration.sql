-- Histórico do custo de produção por produto/competência (gravado ao aplicar o custeio).
CREATE TABLE IF NOT EXISTS "ItemCustoHistorico" (
  "id"               TEXT NOT NULL,
  "empresaId"        TEXT NOT NULL DEFAULT 'emp_tramontin',
  "itemId"           TEXT NOT NULL,
  "competencia"      TIMESTAMP(3) NOT NULL,
  "materialMilheiro" DECIMAL(15,4) NOT NULL DEFAULT 0,
  "modMilheiro"      DECIMAL(15,4) NOT NULL DEFAULT 0,
  "cifMilheiro"      DECIMAL(15,4) NOT NULL DEFAULT 0,
  "custoUnitario"    DECIMAL(15,4) NOT NULL DEFAULT 0,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ItemCustoHistorico_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ItemCustoHistorico_empresaId_itemId_competencia_key" ON "ItemCustoHistorico"("empresaId","itemId","competencia");
CREATE INDEX IF NOT EXISTS "ItemCustoHistorico_itemId_idx" ON "ItemCustoHistorico"("itemId");
