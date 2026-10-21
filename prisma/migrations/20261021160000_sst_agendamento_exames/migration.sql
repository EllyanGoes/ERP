-- Agendamento de exames com a clínica (SST): clínica + tabela de preço, lote e agendamento por colaborador.
CREATE TABLE IF NOT EXISTS "SstClinica" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "fornecedorId" TEXT,
  "cnpj" TEXT,
  "endereco" TEXT,
  "telefone" TEXT,
  "email" TEXT,
  "contato" TEXT,
  "observacoes" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstClinica_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SstClinica_empresaId_nome_idx" ON "SstClinica"("empresaId", "nome");
DO $$ BEGIN
  ALTER TABLE "SstClinica" ADD CONSTRAINT "SstClinica_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "SstClinica" ADD CONSTRAINT "SstClinica_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "SstClinicaPreco" (
  "clinicaId" TEXT NOT NULL,
  "exameTipoId" TEXT NOT NULL,
  "preco" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "SstClinicaPreco_pkey" PRIMARY KEY ("clinicaId", "exameTipoId")
);
DO $$ BEGIN
  ALTER TABLE "SstClinicaPreco" ADD CONSTRAINT "SstClinicaPreco_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "SstClinica"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "SstClinicaPreco" ADD CONSTRAINT "SstClinicaPreco_exameTipoId_fkey" FOREIGN KEY ("exameTipoId") REFERENCES "SstExameTipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "SstAgendamentoLote" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "numero" INTEGER NOT NULL,
  "clinicaId" TEXT NOT NULL,
  "observacoes" TEXT,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstAgendamentoLote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SstAgendamentoLote_empresaId_numero_key" ON "SstAgendamentoLote"("empresaId", "numero");
DO $$ BEGIN
  ALTER TABLE "SstAgendamentoLote" ADD CONSTRAINT "SstAgendamentoLote_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "SstAgendamentoLote" ADD CONSTRAINT "SstAgendamentoLote_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "SstClinica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "SstAgendamento" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "loteId" TEXT,
  "clinicaId" TEXT NOT NULL,
  "colaboradorId" TEXT NOT NULL,
  "data" DATE NOT NULL,
  "periodo" TEXT NOT NULL DEFAULT 'MANHA',
  "tipoAso" TEXT NOT NULL DEFAULT 'PERIODICO',
  "status" TEXT NOT NULL DEFAULT 'AGENDADO',
  "asoId" TEXT,
  "observacoes" TEXT,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstAgendamento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SstAgendamento_asoId_key" ON "SstAgendamento"("asoId");
CREATE INDEX IF NOT EXISTS "SstAgendamento_empresaId_data_idx" ON "SstAgendamento"("empresaId", "data");
CREATE INDEX IF NOT EXISTS "SstAgendamento_colaboradorId_status_idx" ON "SstAgendamento"("colaboradorId", "status");
DO $$ BEGIN
  ALTER TABLE "SstAgendamento" ADD CONSTRAINT "SstAgendamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "SstAgendamento" ADD CONSTRAINT "SstAgendamento_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "SstAgendamentoLote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "SstAgendamento" ADD CONSTRAINT "SstAgendamento_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "SstClinica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "SstAgendamento" ADD CONSTRAINT "SstAgendamento_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "SstAgendamento" ADD CONSTRAINT "SstAgendamento_asoId_fkey" FOREIGN KEY ("asoId") REFERENCES "SstAso"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "SstAgendamentoExame" (
  "agendamentoId" TEXT NOT NULL,
  "exameTipoId" TEXT NOT NULL,
  "preco" DECIMAL(12,2),
  CONSTRAINT "SstAgendamentoExame_pkey" PRIMARY KEY ("agendamentoId", "exameTipoId")
);
DO $$ BEGIN
  ALTER TABLE "SstAgendamentoExame" ADD CONSTRAINT "SstAgendamentoExame_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "SstAgendamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "SstAgendamentoExame" ADD CONSTRAINT "SstAgendamentoExame_exameTipoId_fkey" FOREIGN KEY ("exameTipoId") REFERENCES "SstExameTipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Clínica em uso pela Tramontin.
INSERT INTO "SstClinica" ("id", "empresaId", "nome", "updatedAt")
SELECT 'sstclin_saude_integrada', 'emp_tramontin', 'Saúde Integrada', now()
WHERE EXISTS (SELECT 1 FROM "Empresa" WHERE id = 'emp_tramontin')
ON CONFLICT ("id") DO NOTHING;
