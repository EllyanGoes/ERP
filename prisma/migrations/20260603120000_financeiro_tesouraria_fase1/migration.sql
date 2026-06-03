-- ── Enums (idempotente) ────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "TipoContaBancaria" AS ENUM ('CORRENTE', 'POUPANCA', 'CAIXA'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TipoCategoriaFinanceira" AS ENUM ('RECEITA', 'DESPESA'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Novas tabelas ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Banco" (
    "id" TEXT NOT NULL,
    "codigo" TEXT,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Banco_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Banco_codigo_key" ON "Banco"("codigo");

CREATE TABLE IF NOT EXISTS "ContaBancaria" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "bancoId" TEXT,
    "agencia" TEXT,
    "numero" TEXT,
    "tipo" "TipoContaBancaria" NOT NULL DEFAULT 'CORRENTE',
    "saldoInicial" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContaBancaria_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContaBancaria_bancoId_idx" ON "ContaBancaria"("bancoId");

CREATE TABLE IF NOT EXISTS "CategoriaFinanceira" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoCategoriaFinanceira" NOT NULL,
    "paiId" TEXT,
    "centroCustoId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CategoriaFinanceira_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CategoriaFinanceira_paiId_idx" ON "CategoriaFinanceira"("paiId");
CREATE INDEX IF NOT EXISTS "CategoriaFinanceira_tipo_idx" ON "CategoriaFinanceira"("tipo");

-- ── Novas colunas em LancamentoCaixa (model LancamentoFinanceiro) ───────────────
ALTER TABLE "LancamentoCaixa"
    ADD COLUMN IF NOT EXISTS "contaBancariaId" TEXT,
    ADD COLUMN IF NOT EXISTS "categoriaFinanceiraId" TEXT,
    ADD COLUMN IF NOT EXISTS "centroCustoId" TEXT,
    ADD COLUMN IF NOT EXISTS "conciliado" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "transferenciaParId" TEXT,
    ADD COLUMN IF NOT EXISTS "favorecido" TEXT;

-- ── Novas colunas em ContaReceber / ContaPagar ─────────────────────────────────
ALTER TABLE "ContaReceber"
    ADD COLUMN IF NOT EXISTS "categoriaFinanceiraId" TEXT,
    ADD COLUMN IF NOT EXISTS "centroCustoId" TEXT,
    ADD COLUMN IF NOT EXISTS "contaBancariaId" TEXT,
    ADD COLUMN IF NOT EXISTS "grupoParcelamentoId" TEXT;

ALTER TABLE "ContaPagar"
    ADD COLUMN IF NOT EXISTS "categoriaFinanceiraId" TEXT,
    ADD COLUMN IF NOT EXISTS "centroCustoId" TEXT,
    ADD COLUMN IF NOT EXISTS "contaBancariaId" TEXT,
    ADD COLUMN IF NOT EXISTS "grupoParcelamentoId" TEXT;

-- ── Backfill: conta "Caixa Geral" e vínculo dos lançamentos existentes ─────────
INSERT INTO "ContaBancaria" ("id", "nome", "tipo", "saldoInicial", "ativo", "createdAt", "updatedAt")
VALUES ('caixa-geral', 'Caixa Geral', 'CAIXA', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

UPDATE "LancamentoCaixa" SET "contaBancariaId" = 'caixa-geral' WHERE "contaBancariaId" IS NULL;

-- contaBancariaId passa a ser obrigatório após o backfill
ALTER TABLE "LancamentoCaixa" ALTER COLUMN "contaBancariaId" SET NOT NULL;

-- ── Backfill: categoria (texto livre de ContaPagar) → CategoriaFinanceira ───────
INSERT INTO "CategoriaFinanceira" ("id", "nome", "tipo", "ativo", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."categoria", 'DESPESA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "categoria" FROM "ContaPagar" WHERE "categoria" IS NOT NULL AND "categoria" <> '') t
WHERE NOT EXISTS (
  SELECT 1 FROM "CategoriaFinanceira" cf WHERE cf."nome" = t."categoria" AND cf."tipo" = 'DESPESA'
);

UPDATE "ContaPagar" cp
SET "categoriaFinanceiraId" = cf."id"
FROM "CategoriaFinanceira" cf
WHERE cf."nome" = cp."categoria" AND cf."tipo" = 'DESPESA'
  AND cp."categoria" IS NOT NULL AND cp."categoria" <> ''
  AND cp."categoriaFinanceiraId" IS NULL;

-- ── Índices das novas colunas ──────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "LancamentoCaixa_transferenciaParId_key" ON "LancamentoCaixa"("transferenciaParId");
CREATE INDEX IF NOT EXISTS "LancamentoCaixa_contaBancariaId_idx" ON "LancamentoCaixa"("contaBancariaId");
CREATE INDEX IF NOT EXISTS "LancamentoCaixa_categoriaFinanceiraId_idx" ON "LancamentoCaixa"("categoriaFinanceiraId");
CREATE INDEX IF NOT EXISTS "ContaReceber_grupoParcelamentoId_idx" ON "ContaReceber"("grupoParcelamentoId");
CREATE INDEX IF NOT EXISTS "ContaPagar_grupoParcelamentoId_idx" ON "ContaPagar"("grupoParcelamentoId");

-- ── Foreign keys (idempotente) ──────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE "ContaBancaria" ADD CONSTRAINT "ContaBancaria_bancoId_fkey" FOREIGN KEY ("bancoId") REFERENCES "Banco"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN ALTER TABLE "CategoriaFinanceira" ADD CONSTRAINT "CategoriaFinanceira_paiId_fkey" FOREIGN KEY ("paiId") REFERENCES "CategoriaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "CategoriaFinanceira" ADD CONSTRAINT "CategoriaFinanceira_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN ALTER TABLE "LancamentoCaixa" ADD CONSTRAINT "LancamentoCaixa_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "LancamentoCaixa" ADD CONSTRAINT "LancamentoCaixa_categoriaFinanceiraId_fkey" FOREIGN KEY ("categoriaFinanceiraId") REFERENCES "CategoriaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "LancamentoCaixa" ADD CONSTRAINT "LancamentoCaixa_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "LancamentoCaixa" ADD CONSTRAINT "LancamentoCaixa_transferenciaParId_fkey" FOREIGN KEY ("transferenciaParId") REFERENCES "LancamentoCaixa"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_categoriaFinanceiraId_fkey" FOREIGN KEY ("categoriaFinanceiraId") REFERENCES "CategoriaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_categoriaFinanceiraId_fkey" FOREIGN KEY ("categoriaFinanceiraId") REFERENCES "CategoriaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
