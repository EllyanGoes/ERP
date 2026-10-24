-- Manutenção fase 4: FKs de ativo em SST/PCP/fechamento, criticidade/regime no ativo,
-- de-para dos materiais do Engeman com os produtos do ERP. Idempotente.

ALTER TABLE "ManutAtivo" ADD COLUMN IF NOT EXISTS "criticidade" "Criticidade";

ALTER TABLE "ManutAtivo" ADD COLUMN IF NOT EXISTS "horasPorDia" DOUBLE PRECISION;

ALTER TABLE "CentroTrabalho" ADD COLUMN IF NOT EXISTS     "ativoId" TEXT;

ALTER TABLE "FechamentoMtbf" ADD COLUMN IF NOT EXISTS     "ativoId" TEXT;

ALTER TABLE "ManutAtivoPeca" ADD COLUMN IF NOT EXISTS     "estoqueMinimo" DECIMAL(15,3);

ALTER TABLE "ManutOrdemMaterial" ADD COLUMN IF NOT EXISTS     "codMatLegado" INTEGER;

ALTER TABLE "SstMaquina" ADD COLUMN IF NOT EXISTS     "ativoId" TEXT;

CREATE TABLE IF NOT EXISTS "ManutMaterialLegado" (
    "id" TEXT NOT NULL,
    "codMat" INTEGER NOT NULL,
    "tag" TEXT,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "itemId" TEXT,
    "situacao" TEXT NOT NULL DEFAULT 'PENDENTE',
    "sugestaoId" TEXT,
    "sugestaoNota" DOUBLE PRECISION,
    "confirmadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManutMaterialLegado_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutPlanoKitLegado" (
    "id" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "codMat" INTEGER NOT NULL,
    "quantidade" DECIMAL(15,3) NOT NULL,

    CONSTRAINT "ManutPlanoKitLegado_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutAtivoPecaLegado" (
    "id" TEXT NOT NULL,
    "ativoId" TEXT NOT NULL,
    "codMat" INTEGER NOT NULL,
    "quantidade" DECIMAL(15,3) NOT NULL,

    CONSTRAINT "ManutAtivoPecaLegado_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ManutMaterialLegado_codMat_key" ON "ManutMaterialLegado"("codMat");

CREATE INDEX IF NOT EXISTS "ManutMaterialLegado_situacao_idx" ON "ManutMaterialLegado"("situacao");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutPlanoKitLegado_planoId_codMat_key" ON "ManutPlanoKitLegado"("planoId", "codMat");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutAtivoPecaLegado_ativoId_codMat_key" ON "ManutAtivoPecaLegado"("ativoId", "codMat");

DO $$ BEGIN
  ALTER TABLE "FechamentoMtbf" ADD CONSTRAINT "FechamentoMtbf_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "ManutAtivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "CentroTrabalho" ADD CONSTRAINT "CentroTrabalho_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "ManutAtivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "SstMaquina" ADD CONSTRAINT "SstMaquina_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "ManutAtivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutMaterialLegado" ADD CONSTRAINT "ManutMaterialLegado_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutPlanoKitLegado" ADD CONSTRAINT "ManutPlanoKitLegado_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "ManutPlano"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutPlanoKitLegado" ADD CONSTRAINT "ManutPlanoKitLegado_codMat_fkey" FOREIGN KEY ("codMat") REFERENCES "ManutMaterialLegado"("codMat") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutAtivoPecaLegado" ADD CONSTRAINT "ManutAtivoPecaLegado_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "ManutAtivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutAtivoPecaLegado" ADD CONSTRAINT "ManutAtivoPecaLegado_codMat_fkey" FOREIGN KEY ("codMat") REFERENCES "ManutMaterialLegado"("codMat") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Backfill: vínculos por codApl → ativoId; criticidade e regime para dentro do ativo.
UPDATE "SstMaquina" s SET "ativoId" = a."id" FROM "ManutAtivo" a WHERE s."ativoId" IS NULL AND s."codApl" = a."codApl";
UPDATE "CentroTrabalho" c SET "ativoId" = a."id" FROM "ManutAtivo" a WHERE c."ativoId" IS NULL AND c."codApl" = a."codApl";
UPDATE "FechamentoMtbf" f SET "ativoId" = a."id" FROM "ManutAtivo" a WHERE f."ativoId" IS NULL AND f."codApl" = a."codApl";
UPDATE "ManutAtivo" a SET "criticidade" = c."criticidade" FROM "AtivoCriticidade" c WHERE a."criticidade" IS NULL AND c."codApl" = a."codApl";
UPDATE "ManutAtivo" a SET "horasPorDia" = r."horasPorDia" FROM "AtivoRegime" r WHERE a."horasPorDia" IS NULL AND r."codApl" = a."codApl";
