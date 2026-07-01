-- Centro de custo no pedido/entrada (herança/orçamento) + pagamento antecipado (PA).
-- Aditivo e idempotente: colunas novas com default; FKs em bloco DO (ignora duplicata).

ALTER TABLE "PedidoCompraItem" ADD COLUMN IF NOT EXISTS "centroCustoId" TEXT;
ALTER TABLE "ConferenciaCompraItem" ADD COLUMN IF NOT EXISTS "centroCustoId" TEXT;
ALTER TABLE "CondicaoPagamento" ADD COLUMN IF NOT EXISTS "pagamentoAntecipado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ContaPagar" ADD COLUMN IF NOT EXISTS "antecipado" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE "PedidoCompraItem"
    ADD CONSTRAINT "PedidoCompraItem_centroCustoId_fkey"
    FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ConferenciaCompraItem"
    ADD CONSTRAINT "ConferenciaCompraItem_centroCustoId_fkey"
    FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "PedidoCompraItem_centroCustoId_idx" ON "PedidoCompraItem"("centroCustoId");
CREATE INDEX IF NOT EXISTS "ConferenciaCompraItem_centroCustoId_idx" ON "ConferenciaCompraItem"("centroCustoId");
