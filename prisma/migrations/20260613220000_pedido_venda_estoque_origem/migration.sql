-- Venda à ordem (triangular): o estoque do pedido pode sair de OUTRA empresa do
-- grupo (estoqueOrigemEmpresaId). precoTransferencia é o preço interno de repasse
-- (informativo na v1). null = venda normal (estoque da própria empresa). Idempotente.
ALTER TABLE "PedidoVenda" ADD COLUMN IF NOT EXISTS "estoqueOrigemEmpresaId" TEXT;
ALTER TABLE "PedidoVenda" ADD COLUMN IF NOT EXISTS "precoTransferencia" DECIMAL(15,2);
-- Pedido de entrega na empresa de origem aponta de volta p/ a venda comercial.
ALTER TABLE "PedidoVenda" ADD COLUMN IF NOT EXISTS "pedidoVendaOrigemId" TEXT;

CREATE INDEX IF NOT EXISTS "PedidoVenda_estoqueOrigemEmpresaId_idx" ON "PedidoVenda"("estoqueOrigemEmpresaId");
CREATE INDEX IF NOT EXISTS "PedidoVenda_pedidoVendaOrigemId_idx" ON "PedidoVenda"("pedidoVendaOrigemId");

DO $do$ BEGIN
  ALTER TABLE "PedidoVenda"
    ADD CONSTRAINT "PedidoVenda_estoqueOrigemEmpresaId_fkey"
    FOREIGN KEY ("estoqueOrigemEmpresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $do$;

DO $do$ BEGIN
  ALTER TABLE "PedidoVenda"
    ADD CONSTRAINT "PedidoVenda_pedidoVendaOrigemId_fkey"
    FOREIGN KEY ("pedidoVendaOrigemId") REFERENCES "PedidoVenda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $do$;
