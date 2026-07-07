-- Marketing: Funis, Campanhas, Leads e Tracking (PRD docs/marketing-funis-prd.md).
-- Todos os models são compartilhados pelo grupo (fora de MODELOS_ESCOPADOS);
-- empresaId é só tag de origem. Migration idempotente (nunca db push em prod).

DO $$ BEGIN
  CREATE TYPE "StatusFunil" AS ENUM ('RASCUNHO', 'ATIVO', 'ARQUIVADO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "TipoFunilNo" AS ENUM ('FONTE', 'PAGINA', 'ACAO', 'ETAPA_OFFLINE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "StatusLead" AS ENUM ('ABERTO', 'GANHO', 'PERDIDO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Funis ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Funil" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "status" "StatusFunil" NOT NULL DEFAULT 'RASCUNHO',
  "canvas" JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  "forecast" JSONB,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  CONSTRAINT "Funil_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FunilNo" (
  "id" TEXT NOT NULL,
  "funilId" TEXT NOT NULL,
  "noId" TEXT NOT NULL,
  "tipo" "TipoFunilNo" NOT NULL,
  "rotulo" TEXT NOT NULL,
  "config" JSONB,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "FunilNo_pkey" PRIMARY KEY ("id")
);

-- ── Campanhas ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Campanha" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "nome" TEXT NOT NULL,
  "plataforma" TEXT NOT NULL,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "idExterno" TEXT,
  "orcamento" DECIMAL(15,2),
  "dataInicio" TIMESTAMP(3),
  "dataFim" TIMESTAMP(3),
  "observacoes" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  CONSTRAINT "Campanha_pkey" PRIMARY KEY ("id")
);

-- ── Leads ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "EtapaLead" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "cor" TEXT,
  "ganho" BOOLEAN NOT NULL DEFAULT false,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "EtapaLead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Lead" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "nome" TEXT NOT NULL,
  "email" TEXT,
  "telefone" TEXT,
  "empresaNome" TEXT,
  "cidade" TEXT,
  "estado" TEXT,
  "status" "StatusLead" NOT NULL DEFAULT 'ABERTO',
  "motivoPerda" TEXT,
  "valorEstimado" DECIMAL(15,2),
  "campanhaId" TEXT,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "origemLivre" TEXT,
  "funilId" TEXT,
  "etapaId" TEXT,
  "clienteId" TEXT,
  "pedidoVendaId" TEXT,
  "convertidoEm" TIMESTAMP(3),
  "visitanteId" TEXT,
  "responsavelId" TEXT,
  "observacoes" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LeadEvento" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "descricao" TEXT,
  "dados" JSONB,
  "criadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadEvento_pkey" PRIMARY KEY ("id")
);

-- ── Tracking web (Fase 3 — tabelas prontas desde já) ────────────────────────

CREATE TABLE IF NOT EXISTS "SiteRastreado" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "dominios" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteRastreado_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TrackingVisitante" (
  "id" TEXT NOT NULL,
  "leadId" TEXT,
  "primeiroEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ultimoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrackingVisitante_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TrackingSessao" (
  "id" TEXT NOT NULL,
  "visitanteId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ultimoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "referrer" TEXT,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "utmTerm" TEXT,
  "utmContent" TEXT,
  "campanhaId" TEXT,
  "dispositivo" TEXT,
  CONSTRAINT "TrackingSessao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TrackingEvento" (
  "id" TEXT NOT NULL,
  "sessaoId" TEXT NOT NULL,
  "visitanteId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "nome" TEXT,
  "path" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrackingEvento_pkey" PRIMARY KEY ("id")
);

-- ── Métricas agregadas, manuais e de ads ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS "MetricaNoDiaria" (
  "id" TEXT NOT NULL,
  "funilId" TEXT NOT NULL,
  "noId" TEXT NOT NULL,
  "data" DATE NOT NULL,
  "fonte" TEXT NOT NULL,
  "visitantes" INTEGER NOT NULL DEFAULT 0,
  "sessoes" INTEGER NOT NULL DEFAULT 0,
  "eventos" INTEGER NOT NULL DEFAULT 0,
  "conversoes" INTEGER NOT NULL DEFAULT 0,
  "receita" DECIMAL(15,2) NOT NULL DEFAULT 0,
  CONSTRAINT "MetricaNoDiaria_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LancamentoManualMetrica" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "funilId" TEXT NOT NULL,
  "noId" TEXT NOT NULL,
  "dataInicio" DATE NOT NULL,
  "dataFim" DATE NOT NULL,
  "visitantes" INTEGER,
  "leads" INTEGER,
  "conversoes" INTEGER,
  "receita" DECIMAL(15,2),
  "observacao" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "criadoPor" TEXT,
  CONSTRAINT "LancamentoManualMetrica_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MetricaCampanhaDiaria" (
  "id" TEXT NOT NULL,
  "campanhaId" TEXT NOT NULL,
  "data" DATE NOT NULL,
  "spend" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "impressoes" INTEGER NOT NULL DEFAULT 0,
  "cliques" INTEGER NOT NULL DEFAULT 0,
  "conversoes" INTEGER NOT NULL DEFAULT 0,
  "bruto" JSONB,
  CONSTRAINT "MetricaCampanhaDiaria_pkey" PRIMARY KEY ("id")
);

-- ── FKs ──────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "Funil" ADD CONSTRAINT "Funil_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "FunilNo" ADD CONSTRAINT "FunilNo_funilId_fkey"
    FOREIGN KEY ("funilId") REFERENCES "Funil"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Campanha" ADD CONSTRAINT "Campanha_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_campanhaId_fkey"
    FOREIGN KEY ("campanhaId") REFERENCES "Campanha"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_funilId_fkey"
    FOREIGN KEY ("funilId") REFERENCES "Funil"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_etapaId_fkey"
    FOREIGN KEY ("etapaId") REFERENCES "EtapaLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_pedidoVendaId_fkey"
    FOREIGN KEY ("pedidoVendaId") REFERENCES "PedidoVenda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "LeadEvento" ADD CONSTRAINT "LeadEvento_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "TrackingSessao" ADD CONSTRAINT "TrackingSessao_campanhaId_fkey"
    FOREIGN KEY ("campanhaId") REFERENCES "Campanha"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "MetricaNoDiaria" ADD CONSTRAINT "MetricaNoDiaria_funilId_fkey"
    FOREIGN KEY ("funilId") REFERENCES "Funil"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "LancamentoManualMetrica" ADD CONSTRAINT "LancamentoManualMetrica_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "LancamentoManualMetrica" ADD CONSTRAINT "LancamentoManualMetrica_funilId_fkey"
    FOREIGN KEY ("funilId") REFERENCES "Funil"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "MetricaCampanhaDiaria" ADD CONSTRAINT "MetricaCampanhaDiaria_campanhaId_fkey"
    FOREIGN KEY ("campanhaId") REFERENCES "Campanha"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Índices ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "Funil_status_idx" ON "Funil"("status");
CREATE INDEX IF NOT EXISTS "Funil_ativo_idx" ON "Funil"("ativo");

CREATE UNIQUE INDEX IF NOT EXISTS "FunilNo_funilId_noId_key" ON "FunilNo"("funilId", "noId");
CREATE INDEX IF NOT EXISTS "FunilNo_tipo_idx" ON "FunilNo"("tipo");

CREATE INDEX IF NOT EXISTS "Campanha_utmCampaign_idx" ON "Campanha"("utmCampaign");
CREATE INDEX IF NOT EXISTS "Campanha_plataforma_idx" ON "Campanha"("plataforma");
CREATE INDEX IF NOT EXISTS "Campanha_ativo_idx" ON "Campanha"("ativo");

CREATE INDEX IF NOT EXISTS "Lead_status_idx" ON "Lead"("status");
CREATE INDEX IF NOT EXISTS "Lead_etapaId_idx" ON "Lead"("etapaId");
CREATE INDEX IF NOT EXISTS "Lead_campanhaId_idx" ON "Lead"("campanhaId");
CREATE INDEX IF NOT EXISTS "Lead_funilId_idx" ON "Lead"("funilId");
CREATE INDEX IF NOT EXISTS "Lead_clienteId_idx" ON "Lead"("clienteId");
CREATE INDEX IF NOT EXISTS "Lead_email_idx" ON "Lead"("email");
CREATE INDEX IF NOT EXISTS "Lead_visitanteId_idx" ON "Lead"("visitanteId");

CREATE INDEX IF NOT EXISTS "LeadEvento_leadId_createdAt_idx" ON "LeadEvento"("leadId", "createdAt");

CREATE INDEX IF NOT EXISTS "TrackingVisitante_leadId_idx" ON "TrackingVisitante"("leadId");

CREATE INDEX IF NOT EXISTS "TrackingSessao_visitanteId_idx" ON "TrackingSessao"("visitanteId");
CREATE INDEX IF NOT EXISTS "TrackingSessao_campanhaId_idx" ON "TrackingSessao"("campanhaId");
CREATE INDEX IF NOT EXISTS "TrackingSessao_inicio_idx" ON "TrackingSessao"("inicio");

CREATE INDEX IF NOT EXISTS "TrackingEvento_createdAt_idx" ON "TrackingEvento"("createdAt");
CREATE INDEX IF NOT EXISTS "TrackingEvento_siteId_path_createdAt_idx" ON "TrackingEvento"("siteId", "path", "createdAt");
CREATE INDEX IF NOT EXISTS "TrackingEvento_sessaoId_idx" ON "TrackingEvento"("sessaoId");
CREATE INDEX IF NOT EXISTS "TrackingEvento_visitanteId_createdAt_idx" ON "TrackingEvento"("visitanteId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "MetricaNoDiaria_funilId_noId_data_fonte_key" ON "MetricaNoDiaria"("funilId", "noId", "data", "fonte");
CREATE INDEX IF NOT EXISTS "MetricaNoDiaria_funilId_data_idx" ON "MetricaNoDiaria"("funilId", "data");

CREATE INDEX IF NOT EXISTS "LancamentoManualMetrica_funilId_noId_dataInicio_idx" ON "LancamentoManualMetrica"("funilId", "noId", "dataInicio");

CREATE UNIQUE INDEX IF NOT EXISTS "MetricaCampanhaDiaria_campanhaId_data_key" ON "MetricaCampanhaDiaria"("campanhaId", "data");
CREATE INDEX IF NOT EXISTS "MetricaCampanhaDiaria_data_idx" ON "MetricaCampanhaDiaria"("data");
