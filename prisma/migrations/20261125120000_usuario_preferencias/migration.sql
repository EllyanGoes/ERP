-- Preferências de interface por usuário (tema, barra de módulos), salvas na conta.
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "preferencias" JSONB;
