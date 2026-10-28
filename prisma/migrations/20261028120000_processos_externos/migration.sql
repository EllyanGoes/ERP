-- Processos externos (docs/processos-prd.md) — fase 1.
CREATE TABLE IF NOT EXISTS "Processo" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "orgao" TEXT NOT NULL,
  "esfera" TEXT,
  "numero" TEXT,
  "numerosExtras" JSONB,
  "portalUrl" TEXT,
  "polo" TEXT,
  "interessadoTipo" TEXT NOT NULL DEFAULT 'EMPRESA',
  "interessadoNome" TEXT,
  "assunto" TEXT,
  "situacao" TEXT NOT NULL DEFAULT 'EM_ANDAMENTO',
  "fase" TEXT,
  "abertoEm" TIMESTAMP(3),
  "encerradoEm" TIMESTAMP(3),
  "responsavelId" TEXT,
  "advogado" TEXT,
  "valorCausa" DECIMAL(15,2),
  "riscoPerda" TEXT,
  "confidencial" BOOLEAN NOT NULL DEFAULT false,
  "imovel" TEXT,
  "imobilizadoId" TEXT,
  "colaboradorId" TEXT,
  "fornecedorId" TEXT,
  "clienteId" TEXT,
  "contratoId" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "observacoes" TEXT,
  "diasSemAndamentoAlerta" INTEGER NOT NULL DEFAULT 60,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Processo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Processo_empresaId_codigo_key" ON "Processo"("empresaId", "codigo");
CREATE INDEX IF NOT EXISTS "Processo_empresaId_situacao_idx" ON "Processo"("empresaId", "situacao");

CREATE TABLE IF NOT EXISTS "ProcessoAndamento" (
  "id" TEXT NOT NULL,
  "processoId" TEXT NOT NULL,
  "data" TIMESTAMP(3) NOT NULL,
  "tipo" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "documentoId" TEXT,
  "origem" TEXT NOT NULL DEFAULT 'MANUAL',
  "usuario" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcessoAndamento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProcessoAndamento_processoId_data_idx" ON "ProcessoAndamento"("processoId", "data");

CREATE TABLE IF NOT EXISTS "ProcessoPrazo" (
  "id" TEXT NOT NULL,
  "processoId" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "vence" TIMESTAMP(3) NOT NULL,
  "avisoDias" INTEGER NOT NULL DEFAULT 5,
  "responsavelId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDENTE',
  "cumpridoEm" TIMESTAMP(3),
  "andamentoId" TEXT,
  "motivo" TEXT,
  "criadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcessoPrazo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProcessoPrazo_processoId_status_idx" ON "ProcessoPrazo"("processoId", "status");
CREATE INDEX IF NOT EXISTS "ProcessoPrazo_status_vence_idx" ON "ProcessoPrazo"("status", "vence");

CREATE TABLE IF NOT EXISTS "ProcessoParte" (
  "id" TEXT NOT NULL,
  "processoId" TEXT NOT NULL,
  "papel" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "documento" TEXT,
  "contato" TEXT,
  "fornecedorId" TEXT,
  "clienteId" TEXT,
  "colaboradorId" TEXT,
  CONSTRAINT "ProcessoParte_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProcessoParte_processoId_idx" ON "ProcessoParte"("processoId");

ALTER TABLE "Documento" ADD COLUMN IF NOT EXISTS "processoId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Processo" ADD CONSTRAINT "Processo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Processo" ADD CONSTRAINT "Processo_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ProcessoAndamento" ADD CONSTRAINT "ProcessoAndamento_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ProcessoPrazo" ADD CONSTRAINT "ProcessoPrazo_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ProcessoParte" ADD CONSTRAINT "ProcessoParte_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Documento" ADD CONSTRAINT "Documento_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "Documento_processoId_idx" ON "Documento"("processoId");
