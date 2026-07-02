-- TES (Tipo de Entrada e Saída): preset de comportamento operacional da linha.
-- NÃO carrega conta contábil de destino. Aditivo e idempotente.

CREATE TABLE IF NOT EXISTS "TipoOperacao" (
  "id"                    TEXT NOT NULL,
  "empresaId"             TEXT NOT NULL DEFAULT 'emp_tramontin',
  "codigo"                TEXT NOT NULL,
  "nome"                  TEXT NOT NULL,
  "sentido"               TEXT NOT NULL DEFAULT 'ENTRADA',
  "estocavel"             BOOLEAN NOT NULL DEFAULT true,
  "almoxarifadoDefaultId" TEXT,
  "compoeCusto"           BOOLEAN NOT NULL DEFAULT false,
  "permiteCapitalizar"    BOOLEAN NOT NULL DEFAULT false,
  "geraFinanceiro"        BOOLEAN NOT NULL DEFAULT true,
  "geraFiscal"            BOOLEAN NOT NULL DEFAULT true,
  "cfop"                  TEXT,
  "naturezaFiscal"        TEXT,
  "centroCustoSugeridoId" TEXT,
  "ativo"                 BOOLEAN NOT NULL DEFAULT true,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TipoOperacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TipoOperacao_empresaId_codigo_key" ON "TipoOperacao"("empresaId", "codigo");
CREATE INDEX IF NOT EXISTS "TipoOperacao_empresaId_idx" ON "TipoOperacao"("empresaId");

-- Vínculo do TES + compoeCusto da linha (null = herda item.compoeCusto).
ALTER TABLE "ConferenciaCompraItem" ADD COLUMN IF NOT EXISTS "tesId" TEXT;
ALTER TABLE "ConferenciaCompraItem" ADD COLUMN IF NOT EXISTS "compoeCusto" BOOLEAN;
ALTER TABLE "RequisicaoMaterialItem" ADD COLUMN IF NOT EXISTS "tesId" TEXT;
ALTER TABLE "RequisicaoMaterialItem" ADD COLUMN IF NOT EXISTS "compoeCusto" BOOLEAN;

DO $$ BEGIN
  ALTER TABLE "TipoOperacao" ADD CONSTRAINT "TipoOperacao_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TipoOperacao" ADD CONSTRAINT "TipoOperacao_almoxarifadoDefaultId_fkey"
    FOREIGN KEY ("almoxarifadoDefaultId") REFERENCES "LocalEstoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TipoOperacao" ADD CONSTRAINT "TipoOperacao_centroCustoSugeridoId_fkey"
    FOREIGN KEY ("centroCustoSugeridoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ConferenciaCompraItem" ADD CONSTRAINT "ConferenciaCompraItem_tesId_fkey"
    FOREIGN KEY ("tesId") REFERENCES "TipoOperacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RequisicaoMaterialItem" ADD CONSTRAINT "RequisicaoMaterialItem_tesId_fkey"
    FOREIGN KEY ("tesId") REFERENCES "TipoOperacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
