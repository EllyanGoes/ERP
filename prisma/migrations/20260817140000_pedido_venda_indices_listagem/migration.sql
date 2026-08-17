-- Índices da listagem paginada de pedidos de venda (ordem padrão e período).
-- Idempotente (padrão do projeto).
CREATE INDEX IF NOT EXISTS "PedidoVenda_empresaId_createdAt_idx" ON "PedidoVenda"("empresaId", "createdAt");
CREATE INDEX IF NOT EXISTS "PedidoVenda_empresaId_dataEmissao_idx" ON "PedidoVenda"("empresaId", "dataEmissao");
