-- SST — Fase 3: incidentes/CAT, ações corretivas, inspeções, CIPA. Idempotente.
DO $$ BEGIN CREATE TYPE "SstTipoIncidente" AS ENUM ('QUASE_ACIDENTE', 'ACIDENTE_SEM_AFASTAMENTO', 'ACIDENTE_COM_AFASTAMENTO', 'TRAJETO', 'DOENCA_OCUPACIONAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SstStatusIncidente" AS ENUM ('ABERTO', 'EM_INVESTIGACAO', 'ACAO_DEFINIDA', 'ENCERRADO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SstResultadoInspecao" AS ENUM ('CONFORME', 'NAO_CONFORME'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "SstIncidente" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "numero" TEXT NOT NULL, "tipo" "SstTipoIncidente" NOT NULL, "data" TIMESTAMP(3) NOT NULL,
  "local" TEXT, "setorId" TEXT, "maquinaId" TEXT, "colaboradorId" TEXT, "descricao" TEXT NOT NULL, "parteCorpo" TEXT, "agente" TEXT, "diasAfastamento" INTEGER,
  "catNumero" TEXT, "catEmitidaEm" TIMESTAMP(3), "catDocumentoId" TEXT, "investigacao" TEXT, "status" "SstStatusIncidente" NOT NULL DEFAULT 'ABERTO',
  "evidencias" TEXT[] DEFAULT ARRAY[]::TEXT[], "criadoPor" TEXT, "atualizadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstIncidente_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SstIncidente_empresaId_numero_key" ON "SstIncidente"("empresaId", "numero");
CREATE INDEX IF NOT EXISTS "SstIncidente_empresaId_data_idx" ON "SstIncidente"("empresaId", "data");

CREATE TABLE IF NOT EXISTS "SstInspecao" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "tipo" TEXT NOT NULL, "maquinaId" TEXT, "descricao" TEXT NOT NULL, "data" TIMESTAMP(3) NOT NULL, "proxima" TIMESTAMP(3),
  "resultado" "SstResultadoInspecao" NOT NULL DEFAULT 'CONFORME', "itens" JSONB, "responsavelId" TEXT, "documentoId" TEXT, "observacoes" TEXT, "criadoPor" TEXT, "atualizadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstInspecao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SstInspecao_empresaId_proxima_idx" ON "SstInspecao"("empresaId", "proxima");

CREATE TABLE IF NOT EXISTS "SstAcaoCorretiva" (
  "id" TEXT NOT NULL, "incidenteId" TEXT, "inspecaoId" TEXT, "descricao" TEXT NOT NULL, "responsavelId" TEXT, "prazo" TIMESTAMP(3), "concluidaEm" TIMESTAMP(3), "tarefaId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SstAcaoCorretiva_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SstAcaoCorretiva_incidenteId_idx" ON "SstAcaoCorretiva"("incidenteId");
CREATE INDEX IF NOT EXISTS "SstAcaoCorretiva_inspecaoId_idx" ON "SstAcaoCorretiva"("inspecaoId");

CREATE TABLE IF NOT EXISTS "SstCipaMandato" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "inicio" TIMESTAMP(3) NOT NULL, "fim" TIMESTAMP(3) NOT NULL, "ataEleicaoDocumentoId" TEXT, "observacoes" TEXT, "criadoPor" TEXT, "atualizadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstCipaMandato_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SstCipaMandato_empresaId_fim_idx" ON "SstCipaMandato"("empresaId", "fim");
CREATE TABLE IF NOT EXISTS "SstCipaMembro" (
  "mandatoId" TEXT NOT NULL, "colaboradorId" TEXT NOT NULL, "papel" TEXT NOT NULL, "representa" TEXT NOT NULL,
  CONSTRAINT "SstCipaMembro_pkey" PRIMARY KEY ("mandatoId", "colaboradorId")
);
CREATE TABLE IF NOT EXISTS "SstCipaReuniao" (
  "id" TEXT NOT NULL, "mandatoId" TEXT NOT NULL, "data" TIMESTAMP(3) NOT NULL, "pauta" TEXT, "ataDocumentoId" TEXT,
  CONSTRAINT "SstCipaReuniao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SstCipaReuniao_mandatoId_data_idx" ON "SstCipaReuniao"("mandatoId", "data");

DO $$ BEGIN ALTER TABLE "SstIncidente" ADD CONSTRAINT "SstIncidente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstIncidente" ADD CONSTRAINT "SstIncidente_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstIncidente" ADD CONSTRAINT "SstIncidente_maquinaId_fkey" FOREIGN KEY ("maquinaId") REFERENCES "SstMaquina"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstIncidente" ADD CONSTRAINT "SstIncidente_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstInspecao" ADD CONSTRAINT "SstInspecao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstInspecao" ADD CONSTRAINT "SstInspecao_maquinaId_fkey" FOREIGN KEY ("maquinaId") REFERENCES "SstMaquina"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstInspecao" ADD CONSTRAINT "SstInspecao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstAcaoCorretiva" ADD CONSTRAINT "SstAcaoCorretiva_incidenteId_fkey" FOREIGN KEY ("incidenteId") REFERENCES "SstIncidente"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstAcaoCorretiva" ADD CONSTRAINT "SstAcaoCorretiva_inspecaoId_fkey" FOREIGN KEY ("inspecaoId") REFERENCES "SstInspecao"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstAcaoCorretiva" ADD CONSTRAINT "SstAcaoCorretiva_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstCipaMandato" ADD CONSTRAINT "SstCipaMandato_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstCipaMembro" ADD CONSTRAINT "SstCipaMembro_mandatoId_fkey" FOREIGN KEY ("mandatoId") REFERENCES "SstCipaMandato"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstCipaMembro" ADD CONSTRAINT "SstCipaMembro_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SstCipaReuniao" ADD CONSTRAINT "SstCipaReuniao_mandatoId_fkey" FOREIGN KEY ("mandatoId") REFERENCES "SstCipaMandato"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
