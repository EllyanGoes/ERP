-- Membro convidado (projetos): usuário sem acesso — aparece nos pickers de
-- membro, login bloqueado. Idempotente (padrão do projeto).
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "convidado" BOOLEAN NOT NULL DEFAULT false;
