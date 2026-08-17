-- Investimentos pessoais (B3): módulo standalone, dados escopados pelo
-- usuarioId (cada usuário só vê a própria carteira). Idempotente (padrão).

DO $$ BEGIN CREATE TYPE "TipoInvestAtivo" AS ENUM ('ACAO', 'FII', 'ETF', 'BDR', 'OUTRO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TipoInvestOperacao" AS ENUM ('COMPRA', 'VENDA'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TipoInvestProvento" AS ENUM ('DIVIDENDO', 'JCP', 'RENDIMENTO', 'OUTRO'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "InvestAtivo" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "nome" TEXT,
    "tipo" "TipoInvestAtivo" NOT NULL DEFAULT 'ACAO',
    "precoAtual" DECIMAL(15,4),
    "precoAtualizadoEm" TIMESTAMP(3),
    CONSTRAINT "InvestAtivo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InvestAtivo_ticker_key" ON "InvestAtivo"("ticker");

CREATE TABLE IF NOT EXISTS "InvestOperacao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "ativoId" TEXT NOT NULL,
    "tipo" "TipoInvestOperacao" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "quantidade" DECIMAL(18,6) NOT NULL,
    "preco" DECIMAL(15,4) NOT NULL,
    "custos" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "chaveImport" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestOperacao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InvestOperacao_usuarioId_chaveImport_key" ON "InvestOperacao"("usuarioId", "chaveImport");
CREATE INDEX IF NOT EXISTS "InvestOperacao_usuarioId_ativoId_data_idx" ON "InvestOperacao"("usuarioId", "ativoId", "data");
DO $$ BEGIN ALTER TABLE "InvestOperacao" ADD CONSTRAINT "InvestOperacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "InvestOperacao" ADD CONSTRAINT "InvestOperacao_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "InvestAtivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "InvestProvento" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "ativoId" TEXT NOT NULL,
    "tipo" "TipoInvestProvento" NOT NULL DEFAULT 'DIVIDENDO',
    "data" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "chaveImport" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestProvento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InvestProvento_usuarioId_chaveImport_key" ON "InvestProvento"("usuarioId", "chaveImport");
CREATE INDEX IF NOT EXISTS "InvestProvento_usuarioId_ativoId_data_idx" ON "InvestProvento"("usuarioId", "ativoId", "data");
DO $$ BEGIN ALTER TABLE "InvestProvento" ADD CONSTRAINT "InvestProvento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "InvestProvento" ADD CONSTRAINT "InvestProvento_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "InvestAtivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
