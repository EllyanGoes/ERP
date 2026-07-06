-- Módulo Fiscal — F0 Fundação (docs/fiscal-prd.md)
-- Camada oficial isolada do gerencial: NF não movimenta estoque/financeiro/contábil.
-- Migration idempotente (padrão do projeto — nunca db push em prod).

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "ModeloDocFiscal" AS ENUM ('NFE', 'NFCE', 'NFSE', 'CTE', 'MDFE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "StatusNotaFiscal" AS ENUM ('EM_DIGITACAO', 'ENVIANDO', 'AUTORIZADA', 'REJEITADA', 'DENEGADA', 'CANCELADA', 'ERRO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Campos fiscais em cadastros existentes ──────────────────────────────────
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "origem" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "gtin" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "gtinTributavel" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "exTipi" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "grupoTributacaoId" TEXT;

ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "indIE" INTEGER NOT NULL DEFAULT 9;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "codigoMunicipioIBGE" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "suframa" TEXT;

ALTER TABLE "Fornecedor" ADD COLUMN IF NOT EXISTS "indIE" INTEGER NOT NULL DEFAULT 9;
ALTER TABLE "Fornecedor" ADD COLUMN IF NOT EXISTS "codigoMunicipioIBGE" TEXT;

-- ── EmpresaFiscal (config 1:1 por empresa) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "EmpresaFiscal" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "crt" INTEGER NOT NULL DEFAULT 3,
  "regimeApuracao" TEXT,
  "cnaePrincipal" TEXT,
  "codigoMunicipioIBGE" TEXT,
  "provedor" TEXT NOT NULL DEFAULT 'FOCUS_NFE',
  "ambiente" TEXT NOT NULL DEFAULT 'HOMOLOGACAO',
  "tokenHomologacao" TEXT,
  "tokenProducao" TEXT,
  "provedorEmpresaRef" TEXT,
  "cscId" TEXT,
  "cscToken" TEXT,
  "certificadoValidade" TIMESTAMP(3),
  "certificadoStatus" TEXT,
  "ultimoNsu" TEXT NOT NULL DEFAULT '0',
  "manifestacaoAutomatica" BOOLEAN NOT NULL DEFAULT true,
  "emiteIbsCbs" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  CONSTRAINT "EmpresaFiscal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmpresaFiscal_empresaId_key" ON "EmpresaFiscal"("empresaId");

-- ── SerieFiscal (numeração no banco) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SerieFiscal" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "modelo" "ModeloDocFiscal" NOT NULL,
  "serie" INTEGER NOT NULL,
  "ambiente" TEXT NOT NULL,
  "proximoNumero" INTEGER NOT NULL DEFAULT 1,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  CONSTRAINT "SerieFiscal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SerieFiscal_empresaId_modelo_serie_ambiente_key"
  ON "SerieFiscal"("empresaId", "modelo", "serie", "ambiente");

-- ── NotaFiscal ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "NotaFiscal" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "modelo" "ModeloDocFiscal" NOT NULL DEFAULT 'NFE',
  "serie" INTEGER NOT NULL,
  "numero" INTEGER NOT NULL,
  "ambiente" TEXT NOT NULL,
  "tipoOperacao" INTEGER NOT NULL DEFAULT 1,
  "finalidade" INTEGER NOT NULL DEFAULT 1,
  "operacaoFiscalId" TEXT,
  "naturezaOperacao" TEXT NOT NULL,
  "status" "StatusNotaFiscal" NOT NULL DEFAULT 'EM_DIGITACAO',
  "chave" TEXT,
  "protocolo" TEXT,
  "dataEmissao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dataAutorizacao" TIMESTAMP(3),
  "codigoRejeicao" TEXT,
  "motivoRejeicao" TEXT,
  "clienteId" TEXT,
  "fornecedorId" TEXT,
  "destSnapshot" JSONB NOT NULL,
  "vProdutos" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "vDesconto" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "vFrete" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "vSeguro" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "vOutro" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "vBcIcms" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "vIcms" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "vIcmsSt" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "vIpi" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "vPis" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "vCofins" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "vIbs" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "vCbs" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "vTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "pedidoVendaId" TEXT,
  "minutaId" TEXT,
  "devolucaoId" TEXT,
  "pedidoCompraId" TEXT,
  "chaveReferenciada" TEXT,
  "provedorRef" TEXT,
  "xmlUrl" TEXT,
  "danfeUrl" TEXT,
  "emailEnviadoEm" TIMESTAMP(3),
  "observacoes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  CONSTRAINT "NotaFiscal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotaFiscal_chave_key" ON "NotaFiscal"("chave");
CREATE UNIQUE INDEX IF NOT EXISTS "NotaFiscal_empresaId_modelo_serie_numero_ambiente_key"
  ON "NotaFiscal"("empresaId", "modelo", "serie", "numero", "ambiente");
CREATE INDEX IF NOT EXISTS "NotaFiscal_empresaId_status_idx" ON "NotaFiscal"("empresaId", "status");
CREATE INDEX IF NOT EXISTS "NotaFiscal_pedidoVendaId_idx" ON "NotaFiscal"("pedidoVendaId");
CREATE INDEX IF NOT EXISTS "NotaFiscal_clienteId_idx" ON "NotaFiscal"("clienteId");
CREATE INDEX IF NOT EXISTS "NotaFiscal_dataEmissao_idx" ON "NotaFiscal"("dataEmissao");

-- ── NotaFiscalItem ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "NotaFiscalItem" (
  "id" TEXT NOT NULL,
  "notaFiscalId" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL,
  "itemId" TEXT,
  "codigo" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "ncm" TEXT NOT NULL,
  "cest" TEXT,
  "gtin" TEXT NOT NULL DEFAULT 'SEM GTIN',
  "cfop" TEXT NOT NULL,
  "unidade" TEXT NOT NULL,
  "quantidade" DECIMAL(15,4) NOT NULL,
  "vUnitario" DECIMAL(15,10) NOT NULL,
  "vDesconto" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "vTotal" DECIMAL(15,2) NOT NULL,
  "origem" INTEGER NOT NULL DEFAULT 0,
  "cstIcms" TEXT,
  "aliqIcms" DECIMAL(7,4),
  "vBcIcms" DECIMAL(15,2),
  "vIcms" DECIMAL(15,2),
  "vIcmsSt" DECIMAL(15,2),
  "cstIpi" TEXT,
  "vIpi" DECIMAL(15,2),
  "cstPis" TEXT,
  "vPis" DECIMAL(15,2),
  "cstCofins" TEXT,
  "vCofins" DECIMAL(15,2),
  "cClassTrib" TEXT,
  "vIbs" DECIMAL(15,2),
  "vCbs" DECIMAL(15,2),
  "tributosJson" JSONB,
  "regraAplicadaId" TEXT,
  CONSTRAINT "NotaFiscalItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "NotaFiscalItem_notaFiscalId_idx" ON "NotaFiscalItem"("notaFiscalId");

-- ── NotaFiscalEvento ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "NotaFiscalEvento" (
  "id" TEXT NOT NULL,
  "notaFiscalId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "sequencia" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'PENDENTE',
  "justificativa" TEXT,
  "correcao" TEXT,
  "protocolo" TEXT,
  "xmlUrl" TEXT,
  "dataEvento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "criadoPor" TEXT,
  CONSTRAINT "NotaFiscalEvento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "NotaFiscalEvento_notaFiscalId_idx" ON "NotaFiscalEvento"("notaFiscalId");

-- ── InutilizacaoNumeracao ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "InutilizacaoNumeracao" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "modelo" "ModeloDocFiscal" NOT NULL DEFAULT 'NFE',
  "serie" INTEGER NOT NULL,
  "numeroInicial" INTEGER NOT NULL,
  "numeroFinal" INTEGER NOT NULL,
  "justificativa" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDENTE',
  "protocolo" TEXT,
  "xmlUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  CONSTRAINT "InutilizacaoNumeracao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InutilizacaoNumeracao_empresaId_idx" ON "InutilizacaoNumeracao"("empresaId");

-- ── DocumentoFiscalRecebido (inbox DF-e) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DocumentoFiscalRecebido" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "chave" TEXT NOT NULL,
  "nsu" TEXT,
  "tipoDocumento" TEXT NOT NULL,
  "origem" TEXT NOT NULL DEFAULT 'DISTRIBUICAO',
  "emitenteCnpj" TEXT NOT NULL,
  "emitenteNome" TEXT NOT NULL,
  "emitenteUf" TEXT,
  "fornecedorId" TEXT,
  "dataEmissao" TIMESTAMP(3),
  "valorTotal" DECIMAL(15,2),
  "situacaoSefaz" TEXT,
  "manifestacao" TEXT NOT NULL DEFAULT 'PENDENTE',
  "statusVinculo" TEXT NOT NULL DEFAULT 'NOVA',
  "xmlCompleto" BOOLEAN NOT NULL DEFAULT false,
  "xmlUrl" TEXT,
  "pedidoCompraId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  CONSTRAINT "DocumentoFiscalRecebido_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentoFiscalRecebido_empresaId_chave_key"
  ON "DocumentoFiscalRecebido"("empresaId", "chave");
CREATE INDEX IF NOT EXISTS "DocumentoFiscalRecebido_empresaId_statusVinculo_idx"
  ON "DocumentoFiscalRecebido"("empresaId", "statusVinculo");
CREATE INDEX IF NOT EXISTS "DocumentoFiscalRecebido_fornecedorId_idx"
  ON "DocumentoFiscalRecebido"("fornecedorId");

-- ── GrupoTributacao / OperacaoFiscal / RegraTributacao ───────────────────────
CREATE TABLE IF NOT EXISTS "GrupoTributacao" (
  "id" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  CONSTRAINT "GrupoTributacao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GrupoTributacao_codigo_key" ON "GrupoTributacao"("codigo");

CREATE TABLE IF NOT EXISTS "OperacaoFiscal" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "codigo" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "finalidade" INTEGER NOT NULL DEFAULT 1,
  "tipoOperacao" INTEGER NOT NULL DEFAULT 1,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  CONSTRAINT "OperacaoFiscal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OperacaoFiscal_empresaId_codigo_key"
  ON "OperacaoFiscal"("empresaId", "codigo");

CREATE TABLE IF NOT EXISTS "RegraTributacao" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "operacaoFiscalId" TEXT NOT NULL,
  "ufDestino" TEXT,
  "dentroEstado" BOOLEAN,
  "tipoContribuinte" TEXT,
  "grupoTributacaoId" TEXT,
  "itemId" TEXT,
  "cfop" TEXT NOT NULL,
  "cstIcms" TEXT NOT NULL,
  "aliqIcms" DECIMAL(7,4),
  "pRedBcIcms" DECIMAL(7,4),
  "modBcIcms" INTEGER DEFAULT 3,
  "temSt" BOOLEAN NOT NULL DEFAULT false,
  "mvaSt" DECIMAL(7,4),
  "cstIpi" TEXT,
  "aliqIpi" DECIMAL(7,4),
  "cstPis" TEXT,
  "aliqPis" DECIMAL(7,4),
  "cstCofins" TEXT,
  "aliqCofins" DECIMAL(7,4),
  "cClassTrib" TEXT,
  "cBeneficio" TEXT,
  "mensagemFiscal" TEXT,
  "prioridade" INTEGER NOT NULL DEFAULT 0,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  CONSTRAINT "RegraTributacao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RegraTributacao_empresaId_operacaoFiscalId_idx"
  ON "RegraTributacao"("empresaId", "operacaoFiscalId");

-- ── FKs ──────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "Item" ADD CONSTRAINT "Item_grupoTributacaoId_fkey"
    FOREIGN KEY ("grupoTributacaoId") REFERENCES "GrupoTributacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "NotaFiscalItem" ADD CONSTRAINT "NotaFiscalItem_notaFiscalId_fkey"
    FOREIGN KEY ("notaFiscalId") REFERENCES "NotaFiscal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "NotaFiscalEvento" ADD CONSTRAINT "NotaFiscalEvento_notaFiscalId_fkey"
    FOREIGN KEY ("notaFiscalId") REFERENCES "NotaFiscal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "RegraTributacao" ADD CONSTRAINT "RegraTributacao_operacaoFiscalId_fkey"
    FOREIGN KEY ("operacaoFiscalId") REFERENCES "OperacaoFiscal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "RegraTributacao" ADD CONSTRAINT "RegraTributacao_grupoTributacaoId_fkey"
    FOREIGN KEY ("grupoTributacaoId") REFERENCES "GrupoTributacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
