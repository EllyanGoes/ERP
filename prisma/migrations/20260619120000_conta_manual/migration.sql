-- Marca se a conta contábil foi criada manualmente pelo usuário (true) ou
-- automaticamente (seed/migrations/motor). Idempotente. Default false = automática.
ALTER TABLE "ContaContabil" ADD COLUMN IF NOT EXISTS "manual" boolean NOT NULL DEFAULT false;
