-- Backfill: Solicitações de Compras que já têm um Pedido de Compra ativo mas
-- ficaram presas em "Em Cotação"/"Aprovada" passam para "Em Pedido".
--
-- Conservador e seguro:
--  • só considera pedidos NÃO cancelados (ligados direto à SC ou via cotação),
--    mesmo critério usado nas travas de duplicidade do código;
--  • SCs com recebimento concluído já estão em status ATENDIDA (a conclusão do
--    Documento de Entrada já cobria EM_COTACAO/APROVADA), então não são tocadas;
--  • idempotente: ao rodar de novo, as linhas já viraram EM_PEDIDO e saem do filtro.
UPDATE "NecessidadeCompra" nc
SET "status" = 'EM_PEDIDO'
WHERE nc."status" IN ('EM_COTACAO', 'APROVADA')
  AND (
    EXISTS (
      SELECT 1 FROM "PedidoCompra" pc
      WHERE pc."necessidadeId" = nc."id"
        AND pc."status" <> 'CANCELADO'
    )
    OR EXISTS (
      SELECT 1
      FROM "PedidoCompra" pc
      JOIN "CotacaoCompra" ct ON ct."id" = pc."cotacaoId"
      WHERE ct."necessidadeId" = nc."id"
        AND pc."status" <> 'CANCELADO'
    )
  );
