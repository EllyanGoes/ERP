-- ── Tabelas OFX (idempotente) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ImportacaoOFX" (
    "id" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "nomeArquivo" TEXT,
    "dataImportacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportacaoOFX_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ImportacaoOFX_contaBancariaId_idx" ON "ImportacaoOFX"("contaBancariaId");

CREATE TABLE IF NOT EXISTS "LinhaOFX" (
    "id" TEXT NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "fitId" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "descricao" TEXT,
    "lancamentoConciliadoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LinhaOFX_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LinhaOFX_lancamentoConciliadoId_key" ON "LinhaOFX"("lancamentoConciliadoId");
CREATE INDEX IF NOT EXISTS "LinhaOFX_importacaoId_idx" ON "LinhaOFX"("importacaoId");

-- ── Foreign keys (idempotente) ──────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE "ImportacaoOFX" ADD CONSTRAINT "ImportacaoOFX_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "LinhaOFX" ADD CONSTRAINT "LinhaOFX_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "ImportacaoOFX"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "LinhaOFX" ADD CONSTRAINT "LinhaOFX_lancamentoConciliadoId_fkey" FOREIGN KEY ("lancamentoConciliadoId") REFERENCES "LancamentoCaixa"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
