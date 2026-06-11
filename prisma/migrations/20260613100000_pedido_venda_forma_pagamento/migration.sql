-- Forma de pagamento no pedido de venda (snapshot do nome do cadastro
-- FormaPagamento, mesmo padrão do campo condicaoPagamento).
ALTER TABLE "PedidoVenda" ADD COLUMN IF NOT EXISTS "formaPagamento" TEXT;
