-- Data do recebimento por LINHA de pagamento do pedido de venda: o pagamento
-- misto pode acontecer em datas distintas (ex.: Pix hoje, dinheiro amanhã).
-- Idempotente: IF NOT EXISTS permite rodar de novo sem erro.
ALTER TABLE "PedidoVendaPagamento" ADD COLUMN IF NOT EXISTS "dataPagamento" TIMESTAMP(3);
