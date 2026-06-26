-- Áreas de operação do colaborador (nomes das etapas do fluxo em que ele pode atuar).
-- Usado para filtrar o responsável das OPs por área. Aditivo: array de texto, default vazio.
ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "areasOperacao" TEXT[] NOT NULL DEFAULT '{}';
