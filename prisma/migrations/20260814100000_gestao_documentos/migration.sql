-- Gestão de Documentos Importantes (GED + Google Drive)
DO $$ BEGIN CREATE TYPE "StatusDocumento" AS ENUM ('VIGENTE', 'VENCE_EM_BREVE', 'VENCIDO', 'EM_RENOVACAO', 'ARQUIVADO'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "DocumentoCategoria" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "diasAlerta" INTEGER NOT NULL DEFAULT 30,
    "exigeValidade" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "DocumentoCategoria_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentoCategoria_slug_key" ON "DocumentoCategoria"("slug");

CREATE TABLE IF NOT EXISTS "Documento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "numero" TEXT,
    "emissor" TEXT,
    "emissao" TIMESTAMP(3),
    "validade" TIMESTAMP(3),
    "diasAlerta" INTEGER,
    "status" "StatusDocumento" NOT NULL DEFAULT 'VIGENTE',
    "confidencial" BOOLEAN NOT NULL DEFAULT false,
    "responsavelId" TEXT,
    "fornecedorId" TEXT,
    "clienteId" TEXT,
    "colaboradorId" TEXT,
    "imobilizadoId" TEXT,
    "versaoVigenteId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "arquivoOk" BOOLEAN NOT NULL DEFAULT true,
    "criadoPor" TEXT,
    "atualizadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Documento_versaoVigenteId_key" ON "Documento"("versaoVigenteId");
CREATE INDEX IF NOT EXISTS "Documento_empresaId_categoriaId_idx" ON "Documento"("empresaId", "categoriaId");
CREATE INDEX IF NOT EXISTS "Documento_validade_idx" ON "Documento"("validade");
CREATE INDEX IF NOT EXISTS "Documento_fornecedorId_idx" ON "Documento"("fornecedorId");
CREATE INDEX IF NOT EXISTS "Documento_clienteId_idx" ON "Documento"("clienteId");
CREATE INDEX IF NOT EXISTS "Documento_colaboradorId_idx" ON "Documento"("colaboradorId");
CREATE INDEX IF NOT EXISTS "Documento_imobilizadoId_idx" ON "Documento"("imobilizadoId");

CREATE TABLE IF NOT EXISTS "DocumentoVersao" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'BLOB',
    "driveFileId" TEXT,
    "url" TEXT,
    "nome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "observacao" TEXT,
    "criadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentoVersao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentoVersao_documentoId_versao_key" ON "DocumentoVersao"("documentoId", "versao");

CREATE TABLE IF NOT EXISTS "DocumentoAcesso" (
    "documentoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    CONSTRAINT "DocumentoAcesso_pkey" PRIMARY KEY ("documentoId", "usuarioId")
);

CREATE TABLE IF NOT EXISTS "DocumentoLog" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentoLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DocumentoLog_documentoId_createdAt_idx" ON "DocumentoLog"("documentoId", "createdAt");

CREATE TABLE IF NOT EXISTS "EmpresaDrive" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "drivePastaId" TEXT NOT NULL,
    "pastasCategoria" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "EmpresaDrive_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmpresaDrive_empresaId_key" ON "EmpresaDrive"("empresaId");

DO $$ BEGIN ALTER TABLE "Documento" ADD CONSTRAINT "Documento_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "DocumentoCategoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Documento" ADD CONSTRAINT "Documento_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Documento" ADD CONSTRAINT "Documento_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Documento" ADD CONSTRAINT "Documento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Documento" ADD CONSTRAINT "Documento_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Documento" ADD CONSTRAINT "Documento_imobilizadoId_fkey" FOREIGN KEY ("imobilizadoId") REFERENCES "Imobilizado"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Documento" ADD CONSTRAINT "Documento_versaoVigenteId_fkey" FOREIGN KEY ("versaoVigenteId") REFERENCES "DocumentoVersao"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "DocumentoVersao" ADD CONSTRAINT "DocumentoVersao_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "DocumentoAcesso" ADD CONSTRAINT "DocumentoAcesso_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "DocumentoAcesso" ADD CONSTRAINT "DocumentoAcesso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "DocumentoLog" ADD CONSTRAINT "DocumentoLog_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "DocumentoLog" ADD CONSTRAINT "DocumentoLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "EmpresaDrive" ADD CONSTRAINT "EmpresaDrive_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Seed das categorias padrão (ids fixos p/ idempotência)
INSERT INTO "DocumentoCategoria" ("id", "nome", "slug", "diasAlerta", "exigeValidade", "ordem") VALUES
  ('cat_certidoes',  'Certidões',             'certidoes',  30, true,  1),
  ('cat_licencas',   'Licenças e Alvarás',    'licencas',   60, true,  2),
  ('cat_contratos',  'Contratos',             'contratos',  30, false, 3),
  ('cat_societario', 'Societário / Jurídico', 'societario', 30, false, 4),
  ('cat_seguros',    'Seguros',               'seguros',    30, true,  5),
  ('cat_frota',      'Frota e Equipamentos',  'frota',      30, false, 6),
  ('cat_pessoas',    'Pessoas',               'pessoas',    30, false, 7),
  ('cat_fiscal',     'Fiscal / Contábil',     'fiscal',     30, false, 8),
  ('cat_outros',     'Outros',                'outros',     30, false, 9)
ON CONFLICT ("id") DO NOTHING;
