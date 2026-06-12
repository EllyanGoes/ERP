-- Modalidade da venda escolhida ao criar o pedido: BALCAO (retirada na loja /
-- PDV, pago no caixa) ou AGENDADA (entrega via minutas, fluxo Tramontin).
-- Pedidos existentes ficam como AGENDADA (comportamento atual). Idempotente.
ALTER TABLE "PedidoVenda" ADD COLUMN IF NOT EXISTS "modalidade" TEXT NOT NULL DEFAULT 'AGENDADA';
