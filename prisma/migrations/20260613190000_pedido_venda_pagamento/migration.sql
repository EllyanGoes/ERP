-- Pagamento misto no pedido de venda: formas previstas com valores (ex.: PIX
-- + dinheiro). PedidoVenda.formaPagamento mantém o resumo em texto.
CREATE TABLE IF NOT EXISTS "PedidoVendaPagamento" (
  "id"            TEXT NOT NULL,
  "pedidoVendaId" TEXT NOT NULL,
  "forma"         TEXT NOT NULL,
  "valor"         DECIMAL(15,2) NOT NULL,
  "ordem"         INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PedidoVendaPagamento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PedidoVendaPagamento_pedidoVendaId_idx" ON "PedidoVendaPagamento"("pedidoVendaId");

DO $do$ BEGIN
  ALTER TABLE "PedidoVendaPagamento"
    ADD CONSTRAINT "PedidoVendaPagamento_pedidoVendaId_fkey"
    FOREIGN KEY ("pedidoVendaId") REFERENCES "PedidoVenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
