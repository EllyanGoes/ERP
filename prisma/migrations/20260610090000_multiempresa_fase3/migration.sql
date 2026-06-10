-- ═══════════════════════════════════════════════════════════════════════════
-- MULTIEMPRESA — FASE 3: vínculo usuário↔empresa + cadastro das empresas do grupo
--
-- 1. UsuarioEmpresa: quais empresas cada usuário pode ativar no seletor.
--    Regra aplicada no código: ADMIN = todas as ativas; USUARIO = vinculadas
--    (sem vínculo = só Tramontin, preservando o comportamento atual).
-- 2. Cadastra Atalaia e Cimento e Mix (vazias) com CNPJ placeholder — ajustar
--    pelo cadastro depois.
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE IF NOT EXISTS "UsuarioEmpresa" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,

    CONSTRAINT "UsuarioEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UsuarioEmpresa_empresaId_idx" ON "UsuarioEmpresa"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UsuarioEmpresa_usuarioId_empresaId_key" ON "UsuarioEmpresa"("usuarioId", "empresaId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "UsuarioEmpresa" ADD CONSTRAINT "UsuarioEmpresa_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "UsuarioEmpresa" ADD CONSTRAINT "UsuarioEmpresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Cadastro das demais empresas do grupo (vazias; CNPJ placeholder)
INSERT INTO "Empresa" (id, "razaoSocial", "nomeFantasia", cnpj, slug, ativo, "createdAt", "updatedAt")
VALUES
  ('emp_atalaia',     'Atalaia',       'Atalaia',       'ATALAIA-AJUSTAR-CNPJ',     'atalaia',       true, now(), now()),
  ('emp_cimentomix',  'Cimento e Mix', 'Cimento e Mix', 'CIMENTOMIX-AJUSTAR-CNPJ',  'cimento-e-mix', true, now(), now())
ON CONFLICT (id) DO NOTHING;
