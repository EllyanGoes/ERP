-- Precificação por markup nas tabelas de preço: % sobre o custo (CMPM) da
-- empresa dona da tabela. markupPct nulo = preço manual; markupPadrao é a
-- sugestão da tabela para novos itens e para o "Aplicar a todos".
ALTER TABLE "TabelaPreco"     ADD COLUMN IF NOT EXISTS "markupPadrao" DECIMAL(8,4);
ALTER TABLE "TabelaPrecoItem" ADD COLUMN IF NOT EXISTS "markupPct"    DECIMAL(8,4);
