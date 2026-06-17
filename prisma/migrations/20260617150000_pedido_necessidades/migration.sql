-- Unifica os tipos de pedido (balcão/agendada) em um único pedido com duas
-- necessidades independentes: pagamento (à vista/a prazo) e entrega (retirada/
-- entrega agendada). A coluna `modalidade` é mantida (derivada de
-- necessidadeEntrega) para os relatórios legados continuarem funcionando.
-- Idempotente nas colunas; o backfill a partir de `modalidade` roda uma vez,
-- quando os registros ainda estão no default.

ALTER TABLE "PedidoVenda" ADD COLUMN IF NOT EXISTS "necessidadePagamento" TEXT NOT NULL DEFAULT 'A_PRAZO';
ALTER TABLE "PedidoVenda" ADD COLUMN IF NOT EXISTS "necessidadeEntrega"   TEXT NOT NULL DEFAULT 'ENTREGA';

-- Backfill histórico a partir de `modalidade` (BALCAO = retirada paga na hora).
UPDATE "PedidoVenda" SET "necessidadeEntrega"   = CASE WHEN "modalidade" = 'BALCAO' THEN 'RETIRADA' ELSE 'ENTREGA' END;
UPDATE "PedidoVenda" SET "necessidadePagamento" = CASE WHEN "modalidade" = 'BALCAO' THEN 'A_VISTA'  ELSE 'A_PRAZO'  END;
