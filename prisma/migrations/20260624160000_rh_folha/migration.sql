-- RH / Folha de Pagamento (idempotente).

-- Enums
DO $$ BEGIN
  CREATE TYPE "ClassificacaoCusto" AS ENUM ('MOD', 'MOI', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "StatusFolha" AS ENUM ('EM_REVISAO', 'FECHADA', 'CANCELADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE "OrigemLancamento" ADD VALUE IF NOT EXISTS 'FOLHA_PAGAMENTO';

-- Colaborador: classificação de custo
ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "classificacaoCusto" "ClassificacaoCusto";

-- ContaPagar: folha já provisionada
ALTER TABLE "ContaPagar" ADD COLUMN IF NOT EXISTS "semProvisao" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ContaPagar" ADD COLUMN IF NOT EXISTS "folhaId" TEXT;
ALTER TABLE "ContaPagar" ADD COLUMN IF NOT EXISTS "contaPassivoId" TEXT;

-- FolhaPagamento
CREATE TABLE IF NOT EXISTS "FolhaPagamento" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "competencia" TIMESTAMP(3) NOT NULL,
  "dataPagamento" TIMESTAMP(3),
  "dataVencimento" TIMESTAMP(3),
  "arquivoUrl" TEXT,
  "arquivoNome" TEXT,
  "status" "StatusFolha" NOT NULL DEFAULT 'EM_REVISAO',
  "totalBruto" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "totalLiquido" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "totalInssRetido" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "totalInssPatronal" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "totalIrrf" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "totalFgts" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "lancamentoId" TEXT,
  "criadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FolhaPagamento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FolhaPagamento_empresaId_competencia_key" ON "FolhaPagamento"("empresaId", "competencia");
CREATE INDEX IF NOT EXISTS "FolhaPagamento_empresaId_status_idx" ON "FolhaPagamento"("empresaId", "status");
DO $$ BEGIN
  ALTER TABLE "FolhaPagamento" ADD CONSTRAINT "FolhaPagamento_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FolhaItem
CREATE TABLE IF NOT EXISTS "FolhaItem" (
  "id" TEXT NOT NULL,
  "folhaId" TEXT NOT NULL,
  "colaboradorId" TEXT,
  "matricula" TEXT,
  "nome" TEXT NOT NULL,
  "cargo" TEXT,
  "classificacao" "ClassificacaoCusto" NOT NULL DEFAULT 'ADMIN',
  "bruto" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "liquido" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "inssRetido" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "inssPatronal" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "irrf" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "fgts" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "outrosDescontos" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "rubricas" JSONB,
  CONSTRAINT "FolhaItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FolhaItem_folhaId_idx" ON "FolhaItem"("folhaId");
CREATE INDEX IF NOT EXISTS "FolhaItem_colaboradorId_idx" ON "FolhaItem"("colaboradorId");
DO $$ BEGIN
  ALTER TABLE "FolhaItem" ADD CONSTRAINT "FolhaItem_folhaId_fkey"
    FOREIGN KEY ("folhaId") REFERENCES "FolhaPagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "FolhaItem" ADD CONSTRAINT "FolhaItem_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
