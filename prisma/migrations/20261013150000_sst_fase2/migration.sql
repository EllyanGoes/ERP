-- SST — Fase 2: treinamentos e máquinas NR-12. Idempotente.
DO $$ BEGIN CREATE TYPE "SstStatusMaquina" AS ENUM ('NAO_AVALIADA', 'NAO_CONFORME', 'EM_ADEQUACAO', 'CONFORME', 'INTERDITADA', 'DESATIVADA'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "SstTreinamentoTipo" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "nome" TEXT NOT NULL, "norma" TEXT, "cargaHoraria" INTEGER, "validadeMeses" INTEGER,
  "ativo" BOOLEAN NOT NULL DEFAULT true, CONSTRAINT "SstTreinamentoTipo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SstTreinamentoTipo_empresaId_nome_key" ON "SstTreinamentoTipo"("empresaId", "nome");

CREATE TABLE IF NOT EXISTS "SstFuncaoTreinamento" (
  "funcaoId" TEXT NOT NULL, "treinamentoTipoId" TEXT NOT NULL,
  CONSTRAINT "SstFuncaoTreinamento_pkey" PRIMARY KEY ("funcaoId", "treinamentoTipoId")
);

CREATE TABLE IF NOT EXISTS "SstTreinamento" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "tipoId" TEXT NOT NULL, "data" TIMESTAMP(3) NOT NULL, "instrutor" TEXT, "entidade" TEXT,
  "cargaHoraria" INTEGER, "listaPresencaDocumentoId" TEXT, "observacoes" TEXT, "criadoPor" TEXT, "atualizadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstTreinamento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SstTreinamento_empresaId_data_idx" ON "SstTreinamento"("empresaId", "data");

CREATE TABLE IF NOT EXISTS "SstTreinamentoParticipante" (
  "treinamentoId" TEXT NOT NULL, "colaboradorId" TEXT NOT NULL, "validade" TIMESTAMP(3), "certificadoDocumentoId" TEXT, "aprovado" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "SstTreinamentoParticipante_pkey" PRIMARY KEY ("treinamentoId", "colaboradorId")
);
CREATE INDEX IF NOT EXISTS "SstTreinamentoParticipante_colaboradorId_validade_idx" ON "SstTreinamentoParticipante"("colaboradorId", "validade");

CREATE TABLE IF NOT EXISTS "SstMaquina" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "codApl" INTEGER, "nome" TEXT NOT NULL, "local" TEXT, "setorId" TEXT, "fabricante" TEXT, "anoFabricacao" INTEGER,
  "status" "SstStatusMaquina" NOT NULL DEFAULT 'NAO_AVALIADA', "apreciacaoRiscoDocumentoId" TEXT, "manualDocumentoId" TEXT, "tarefaId" TEXT, "observacoes" TEXT,
  "criadoPor" TEXT, "atualizadoPor" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstMaquina_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SstMaquina_empresaId_status_idx" ON "SstMaquina"("empresaId", "status");

CREATE TABLE IF NOT EXISTS "SstMaquinaProtecao" (
  "id" TEXT NOT NULL, "maquinaId" TEXT NOT NULL, "descricao" TEXT NOT NULL, "tipo" TEXT, "conforme" BOOLEAN NOT NULL DEFAULT false,
  "evidenciaDocumentoId" TEXT, "verificadoEm" TIMESTAMP(3), "observacoes" TEXT,
  CONSTRAINT "SstMaquinaProtecao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SstMaquinaProtecao_maquinaId_idx" ON "SstMaquinaProtecao"("maquinaId");

DO $$ BEGIN ALTER TABLE "SstTreinamentoTipo" ADD CONSTRAINT "SstTreinamentoTipo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstFuncaoTreinamento" ADD CONSTRAINT "SstFuncaoTreinamento_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "SstFuncao"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstFuncaoTreinamento" ADD CONSTRAINT "SstFuncaoTreinamento_treinamentoTipoId_fkey" FOREIGN KEY ("treinamentoTipoId") REFERENCES "SstTreinamentoTipo"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstTreinamento" ADD CONSTRAINT "SstTreinamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstTreinamento" ADD CONSTRAINT "SstTreinamento_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "SstTreinamentoTipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstTreinamentoParticipante" ADD CONSTRAINT "SstTreinamentoParticipante_treinamentoId_fkey" FOREIGN KEY ("treinamentoId") REFERENCES "SstTreinamento"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstTreinamentoParticipante" ADD CONSTRAINT "SstTreinamentoParticipante_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstMaquina" ADD CONSTRAINT "SstMaquina_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstMaquina" ADD CONSTRAINT "SstMaquina_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstMaquinaProtecao" ADD CONSTRAINT "SstMaquinaProtecao_maquinaId_fkey" FOREIGN KEY ("maquinaId") REFERENCES "SstMaquina"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
