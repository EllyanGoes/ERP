-- Conta de destino do recebimento por forma de pagamento do pedido: ao
-- receber no caixa (venda balcão), grava a conta onde cada forma caiu
-- (ex.: PIX → Banco X), para o detalhe mostrar a conta. Idempotente.
ALTER TABLE "PedidoVendaPagamento" ADD COLUMN IF NOT EXISTS "contaBancariaId" TEXT;

DO $do$ BEGIN
  ALTER TABLE "PedidoVendaPagamento"
    ADD CONSTRAINT "PedidoVendaPagamento_contaBancariaId_fkey"
    FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
