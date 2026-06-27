-- Perda POR PRODUTO no apontamento: descarregado dos vagões − apontado, por produto.
-- A perda da etapa (ItemOrdemProducao.qtdPerda) continua guardando a soma.
ALTER TABLE "OrdemProducaoProdutoItem" ADD COLUMN IF NOT EXISTS "qtdPerda" DECIMAL(15,3);
