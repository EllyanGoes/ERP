-- SST — Fase 1 (docs/sst-prd.md). Idempotente.
DO $$ BEGIN CREATE TYPE "SstTipoEntregaEpi" AS ENUM ('ENTREGA', 'TROCA', 'DEVOLUCAO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SstTipoAso" AS ENUM ('ADMISSIONAL', 'PERIODICO', 'MUDANCA_RISCO', 'RETORNO', 'DEMISSIONAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SstResultadoAso" AS ENUM ('APTO', 'INAPTO', 'APTO_RESTRICOES'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "SstFuncao" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "nome" TEXT NOT NULL, "cbo" TEXT, "grauRisco" INTEGER,
  "ativo" BOOLEAN NOT NULL DEFAULT true, "criadoPor" TEXT, "atualizadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstFuncao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SstFuncao_empresaId_nome_key" ON "SstFuncao"("empresaId", "nome");

CREATE TABLE IF NOT EXISTS "SstEpi" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "itemId" TEXT, "nome" TEXT NOT NULL, "ca" TEXT, "caValidade" TIMESTAMP(3),
  "vidaUtilDias" INTEGER, "fabricante" TEXT, "ativo" BOOLEAN NOT NULL DEFAULT true, "criadoPor" TEXT, "atualizadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstEpi_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SstEpi_empresaId_ativo_idx" ON "SstEpi"("empresaId", "ativo");

CREATE TABLE IF NOT EXISTS "SstExameTipo" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "nome" TEXT NOT NULL, "periodicidadeMeses" INTEGER,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "SstExameTipo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SstExameTipo_empresaId_nome_key" ON "SstExameTipo"("empresaId", "nome");

CREATE TABLE IF NOT EXISTS "SstFuncaoEpi" (
  "funcaoId" TEXT NOT NULL, "epiId" TEXT NOT NULL, "obrigatorio" BOOLEAN NOT NULL DEFAULT true, "quantidade" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "SstFuncaoEpi_pkey" PRIMARY KEY ("funcaoId", "epiId")
);
CREATE TABLE IF NOT EXISTS "SstFuncaoExame" (
  "funcaoId" TEXT NOT NULL, "exameTipoId" TEXT NOT NULL, "periodicidadeMeses" INTEGER NOT NULL,
  CONSTRAINT "SstFuncaoExame_pkey" PRIMARY KEY ("funcaoId", "exameTipoId")
);
CREATE TABLE IF NOT EXISTS "SstColaboradorFuncao" (
  "id" TEXT NOT NULL, "colaboradorId" TEXT NOT NULL, "funcaoId" TEXT NOT NULL, "inicio" TIMESTAMP(3) NOT NULL, "fim" TIMESTAMP(3),
  CONSTRAINT "SstColaboradorFuncao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SstColaboradorFuncao_colaboradorId_fim_idx" ON "SstColaboradorFuncao"("colaboradorId", "fim");
CREATE INDEX IF NOT EXISTS "SstColaboradorFuncao_funcaoId_idx" ON "SstColaboradorFuncao"("funcaoId");

CREATE TABLE IF NOT EXISTS "SstEpiEntrega" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "colaboradorId" TEXT NOT NULL, "epiId" TEXT NOT NULL,
  "tipo" "SstTipoEntregaEpi" NOT NULL DEFAULT 'ENTREGA', "quantidade" INTEGER NOT NULL DEFAULT 1, "data" TIMESTAMP(3) NOT NULL,
  "motivo" TEXT, "vencimentoUso" TIMESTAMP(3), "movimentacaoEstoqueId" TEXT, "documentoId" TEXT, "criadoPor" TEXT, "atualizadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstEpiEntrega_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SstEpiEntrega_colaboradorId_data_idx" ON "SstEpiEntrega"("colaboradorId", "data");
CREATE INDEX IF NOT EXISTS "SstEpiEntrega_epiId_idx" ON "SstEpiEntrega"("epiId");

CREATE TABLE IF NOT EXISTS "SstAso" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "colaboradorId" TEXT NOT NULL, "tipo" "SstTipoAso" NOT NULL, "data" TIMESTAMP(3) NOT NULL,
  "validade" TIMESTAMP(3), "resultado" "SstResultadoAso" NOT NULL DEFAULT 'APTO', "restricoes" TEXT, "medico" TEXT, "crm" TEXT, "documentoId" TEXT,
  "criadoPor" TEXT, "atualizadoPor" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstAso_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SstAso_colaboradorId_validade_idx" ON "SstAso"("colaboradorId", "validade");

CREATE TABLE IF NOT EXISTS "SstAsoExame" (
  "asoId" TEXT NOT NULL, "exameTipoId" TEXT NOT NULL, "data" TIMESTAMP(3) NOT NULL, "resultado" TEXT, "documentoId" TEXT,
  CONSTRAINT "SstAsoExame_pkey" PRIMARY KEY ("asoId", "exameTipoId")
);

CREATE TABLE IF NOT EXISTS "SstObrigacao" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "nome" TEXT NOT NULL, "norma" TEXT, "categoriaGedId" TEXT NOT NULL,
  "periodicidadeMeses" INTEGER, "responsavelId" TEXT, "observacoes" TEXT, "criadoPor" TEXT, "atualizadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstObrigacao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SstObrigacao_empresaId_nome_key" ON "SstObrigacao"("empresaId", "nome");

DO $$ BEGIN ALTER TABLE "SstFuncao" ADD CONSTRAINT "SstFuncao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstEpi" ADD CONSTRAINT "SstEpi_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstEpi" ADD CONSTRAINT "SstEpi_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstExameTipo" ADD CONSTRAINT "SstExameTipo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstFuncaoEpi" ADD CONSTRAINT "SstFuncaoEpi_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "SstFuncao"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstFuncaoEpi" ADD CONSTRAINT "SstFuncaoEpi_epiId_fkey" FOREIGN KEY ("epiId") REFERENCES "SstEpi"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstFuncaoExame" ADD CONSTRAINT "SstFuncaoExame_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "SstFuncao"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstFuncaoExame" ADD CONSTRAINT "SstFuncaoExame_exameTipoId_fkey" FOREIGN KEY ("exameTipoId") REFERENCES "SstExameTipo"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstColaboradorFuncao" ADD CONSTRAINT "SstColaboradorFuncao_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstColaboradorFuncao" ADD CONSTRAINT "SstColaboradorFuncao_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "SstFuncao"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstEpiEntrega" ADD CONSTRAINT "SstEpiEntrega_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstEpiEntrega" ADD CONSTRAINT "SstEpiEntrega_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstEpiEntrega" ADD CONSTRAINT "SstEpiEntrega_epiId_fkey" FOREIGN KEY ("epiId") REFERENCES "SstEpi"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstAso" ADD CONSTRAINT "SstAso_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstAso" ADD CONSTRAINT "SstAso_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstAsoExame" ADD CONSTRAINT "SstAsoExame_asoId_fkey" FOREIGN KEY ("asoId") REFERENCES "SstAso"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstAsoExame" ADD CONSTRAINT "SstAsoExame_exameTipoId_fkey" FOREIGN KEY ("exameTipoId") REFERENCES "SstExameTipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstObrigacao" ADD CONSTRAINT "SstObrigacao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstObrigacao" ADD CONSTRAINT "SstObrigacao_categoriaGedId_fkey" FOREIGN KEY ("categoriaGedId") REFERENCES "DocumentoCategoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstObrigacao" ADD CONSTRAINT "SstObrigacao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
