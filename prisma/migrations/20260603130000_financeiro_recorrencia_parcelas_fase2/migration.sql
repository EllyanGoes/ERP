-- ── Enums (idempotente) ────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "TipoRecorrencia" AS ENUM ('RECEBER', 'PAGAR'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PeriodicidadeRecorrencia" AS ENUM ('SEMANAL', 'MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Tabela Recorrencia ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Recorrencia" (
    "id" TEXT NOT NULL,
    "tipo" "TipoRecorrencia" NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "categoriaFinanceiraId" TEXT,
    "contaBancariaId" TEXT,
    "clienteId" TEXT,
    "fornecedorId" TEXT,
    "centroCustoId" TEXT,
    "periodicidade" "PeriodicidadeRecorrencia" NOT NULL DEFAULT 'MENSAL',
    "diaVencimento" INTEGER NOT NULL DEFAULT 1,
    "proximaGeracao" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Recorrencia_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Recorrencia_ativo_idx" ON "Recorrencia"("ativo");
CREATE INDEX IF NOT EXISTS "Recorrencia_proximaGeracao_idx" ON "Recorrencia"("proximaGeracao");

-- ── Novas colunas em ContaReceber / ContaPagar ─────────────────────────────────
ALTER TABLE "ContaReceber"
    ADD COLUMN IF NOT EXISTS "recorrenciaId" TEXT,
    ADD COLUMN IF NOT EXISTS "parcelaNumero" INTEGER,
    ADD COLUMN IF NOT EXISTS "parcelaTotal" INTEGER;

ALTER TABLE "ContaPagar"
    ADD COLUMN IF NOT EXISTS "recorrenciaId" TEXT,
    ADD COLUMN IF NOT EXISTS "parcelaNumero" INTEGER,
    ADD COLUMN IF NOT EXISTS "parcelaTotal" INTEGER;

CREATE INDEX IF NOT EXISTS "ContaReceber_recorrenciaId_idx" ON "ContaReceber"("recorrenciaId");
CREATE INDEX IF NOT EXISTS "ContaPagar_recorrenciaId_idx" ON "ContaPagar"("recorrenciaId");

-- ── Foreign keys (idempotente) ──────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE "Recorrencia" ADD CONSTRAINT "Recorrencia_categoriaFinanceiraId_fkey" FOREIGN KEY ("categoriaFinanceiraId") REFERENCES "CategoriaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Recorrencia" ADD CONSTRAINT "Recorrencia_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Recorrencia" ADD CONSTRAINT "Recorrencia_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Recorrencia" ADD CONSTRAINT "Recorrencia_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Recorrencia" ADD CONSTRAINT "Recorrencia_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_recorrenciaId_fkey" FOREIGN KEY ("recorrenciaId") REFERENCES "Recorrencia"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_recorrenciaId_fkey" FOREIGN KEY ("recorrenciaId") REFERENCES "Recorrencia"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
