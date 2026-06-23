-- Insumos consumidos por etapa da ordem de produção (snapshot do nó de operação).
-- Guarda [{ itemId, descricao, consumoPorMilheiro }] para o apontamento custear a fase.
ALTER TABLE "ItemOrdemProducao" ADD COLUMN IF NOT EXISTS "insumos" JSONB;
