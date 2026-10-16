-- Histórico funcional do colaborador.
DO $$ BEGIN
  CREATE TYPE "TipoEventoColaborador" AS ENUM ('ADMISSAO', 'DEMISSAO', 'AFASTAMENTO', 'FERIAS', 'MUDANCA_CARGO', 'MUDANCA_SETOR', 'ADVERTENCIA', 'SUSPENSAO', 'OUTRO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "ColaboradorEvento" (
  "id" TEXT NOT NULL,
  "colaboradorId" TEXT NOT NULL,
  "tipo" "TipoEventoColaborador" NOT NULL,
  "data" TIMESTAMP(3) NOT NULL,
  "dataFim" TIMESTAMP(3),
  "motivo" TEXT,
  "detalhes" JSONB,
  "observacao" TEXT,
  "documentoId" TEXT,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ColaboradorEvento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ColaboradorEvento_colaboradorId_data_idx" ON "ColaboradorEvento"("colaboradorId", "data");
CREATE INDEX IF NOT EXISTS "ColaboradorEvento_tipo_dataFim_idx" ON "ColaboradorEvento"("tipo", "dataFim");
DO $$ BEGIN
  ALTER TABLE "ColaboradorEvento" ADD CONSTRAINT "ColaboradorEvento_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Eventos de admissão/demissão a partir das datas já cadastradas.
INSERT INTO "ColaboradorEvento" ("id", "colaboradorId", "tipo", "data", "criadoPor", "updatedAt")
SELECT 'colev_adm_' || substr(md5(c.id), 1, 18), c.id, 'ADMISSAO', c."dataAdmissao", 'sistema', now()
FROM "Colaborador" c WHERE c."dataAdmissao" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "ColaboradorEvento" ("id", "colaboradorId", "tipo", "data", "criadoPor", "updatedAt")
SELECT 'colev_dem_' || substr(md5(c.id), 1, 18), c.id, 'DEMISSAO', c."dataDemissao", 'sistema', now()
FROM "Colaborador" c WHERE c."dataDemissao" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

-- Categoria do GED p/ os documentos do histórico (atestado, aviso, termo…).
INSERT INTO "DocumentoCategoria" ("id", "nome", "slug", "ordem", "ativo")
SELECT 'doccat_rh_historico', 'RH — Histórico funcional', 'rh-historico', 90, true
WHERE NOT EXISTS (SELECT 1 FROM "DocumentoCategoria" WHERE "slug" = 'rh-historico');
