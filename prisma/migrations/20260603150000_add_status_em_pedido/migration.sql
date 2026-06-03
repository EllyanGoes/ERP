-- Adiciona o status EM_PEDIDO à StatusNecessidade (Solicitação de Compras).
-- A SC entra em EM_PEDIDO quando um Pedido de Compra é gerado a partir dela
-- (formalizando uma cotação ou criando o pedido direto na SC) e sai para
-- PARCIALMENTE/TOTALMENTE_ATENDIDA quando o material é recebido (DE concluído).
-- Idempotente e aditivo: não altera linhas existentes.
ALTER TYPE "StatusNecessidade" ADD VALUE IF NOT EXISTS 'EM_PEDIDO';
