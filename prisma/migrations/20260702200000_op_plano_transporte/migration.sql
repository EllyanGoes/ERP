-- Planejamento por transporte da OP (vagões/vagonetas) persistido: reabrir a OP
-- mantém a configuração e a impressão gera o apontamento por vagão.
ALTER TABLE "OrdemProducao" ADD COLUMN IF NOT EXISTS "planoTransporte" JSONB;
