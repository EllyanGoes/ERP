-- Compras espelhando vendas: status financeiro no pedido de compra, condição de
-- pagamento estruturada (no pedido e no Documento de Entrada), e vínculo do
-- contas a pagar ao pedido. ContaPagar.dataVencimento vira opcional (sem
-- previsão). Idempotente.

DO $$ BEGIN
  CREATE TYPE "StatusFinanceiroCompra" AS ENUM ('NAO_FATURADO', 'A_PAGAR', 'PARCIAL', 'PAGO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "PedidoCompra" ADD COLUMN IF NOT EXISTS "statusFinanceiro" "StatusFinanceiroCompra" NOT NULL DEFAULT 'NAO_FATURADO';
ALTER TABLE "PedidoCompra" ADD COLUMN IF NOT EXISTS "condicaoPagamentoId" TEXT;
ALTER TABLE "ConferenciaCompra" ADD COLUMN IF NOT EXISTS "condicaoPagamentoId" TEXT;
ALTER TABLE "ContaPagar" ADD COLUMN IF NOT EXISTS "pedidoCompraId" TEXT;
ALTER TABLE "ContaPagar" ALTER COLUMN "dataVencimento" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "ContaPagar_pedidoCompraId_idx" ON "ContaPagar"("pedidoCompraId");

DO $$ BEGIN
  ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_condicaoPagamentoId_fkey"
    FOREIGN KEY ("condicaoPagamentoId") REFERENCES "CondicaoPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ConferenciaCompra" ADD CONSTRAINT "ConferenciaCompra_condicaoPagamentoId_fkey"
    FOREIGN KEY ("condicaoPagamentoId") REFERENCES "CondicaoPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_pedidoCompraId_fkey"
    FOREIGN KEY ("pedidoCompraId") REFERENCES "PedidoCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill da condição estruturada no pedido de compra (casa pelo nome).
UPDATE "PedidoCompra" pc
SET "condicaoPagamentoId" = cp.id
FROM "CondicaoPagamento" cp
WHERE pc."condicaoPagamentoId" IS NULL
  AND pc."condicoesPagamento" IS NOT NULL
  AND lower(btrim(pc."condicoesPagamento")) = lower(btrim(cp.nome));
