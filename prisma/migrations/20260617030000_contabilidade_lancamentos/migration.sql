-- Fase C — Lançamentos contábeis (partidas dobradas). Idempotente.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrigemLancamento') THEN
    CREATE TYPE "OrigemLancamento" AS ENUM ('VENDA', 'RECEBIMENTO', 'COMPRA', 'PAGAMENTO', 'MANUAL', 'ESTORNO');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoPartida') THEN
    CREATE TYPE "TipoPartida" AS ENUM ('DEBITO', 'CREDITO');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "LancamentoContabil" (
  "id"          TEXT NOT NULL,
  "empresaId"   TEXT NOT NULL DEFAULT 'emp_tramontin',
  "data"        TIMESTAMP(3) NOT NULL,
  "historico"   TEXT NOT NULL,
  "origemTipo"  "OrigemLancamento" NOT NULL,
  "origemId"    TEXT,
  "estornoDeId" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LancamentoContabil_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LancamentoContabil_estornoDeId_key" ON "LancamentoContabil"("estornoDeId");
CREATE UNIQUE INDEX IF NOT EXISTS "LancamentoContabil_empresaId_origemTipo_origemId_key" ON "LancamentoContabil"("empresaId", "origemTipo", "origemId");
CREATE INDEX IF NOT EXISTS "LancamentoContabil_empresaId_data_idx" ON "LancamentoContabil"("empresaId", "data");

CREATE TABLE IF NOT EXISTS "PartidaContabil" (
  "id"           TEXT NOT NULL,
  "empresaId"    TEXT NOT NULL DEFAULT 'emp_tramontin',
  "lancamentoId" TEXT NOT NULL,
  "contaId"      TEXT NOT NULL,
  "tipo"         "TipoPartida" NOT NULL,
  "valor"        DECIMAL(15,2) NOT NULL,
  "clienteId"    TEXT,
  "fornecedorId" TEXT,
  CONSTRAINT "PartidaContabil_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PartidaContabil_empresaId_idx" ON "PartidaContabil"("empresaId");
CREATE INDEX IF NOT EXISTS "PartidaContabil_contaId_idx" ON "PartidaContabil"("contaId");
CREATE INDEX IF NOT EXISTS "PartidaContabil_lancamentoId_idx" ON "PartidaContabil"("lancamentoId");
