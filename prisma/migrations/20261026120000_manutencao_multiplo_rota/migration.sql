-- Planos: revisão escalonada (a cada N execuções) e rotas (várias aplicações numa OS só).
ALTER TABLE "ManutPlanoTarefa" ADD COLUMN IF NOT EXISTS "multiplo" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ManutPlanoMaterial" ADD COLUMN IF NOT EXISTS "multiplo" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ManutPlano" ADD COLUMN IF NOT EXISTS "rota" TEXT;
ALTER TABLE "ManutOrdem" ADD COLUMN IF NOT EXISTS "planoAtivosRota" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
