-- Empresa restrita: visível apenas para usuários com vínculo explícito em
-- UsuarioEmpresa (mesmo ADMIN), e fora das listas "do grupo" (venda à ordem).
-- Idempotente (padrão do projeto).
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "restrita" BOOLEAN NOT NULL DEFAULT false;
