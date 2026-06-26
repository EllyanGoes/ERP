-- Amplia a precisão de ItemUnidade.fatorConversao (15,6 -> 18,9).
-- Necessário para fatores de conversão entre unidades de escalas muito diferentes
-- (ex.: kg -> Batch = 1/54000 ≈ 0,000018519, que em 6 casas decimais arredondaria
-- para 0,000019, ~2,6% de erro). Aditivo e seguro (apenas amplia; nenhum valor existente é perdido).
ALTER TABLE "ItemUnidade" ALTER COLUMN "fatorConversao" TYPE numeric(18, 9);
