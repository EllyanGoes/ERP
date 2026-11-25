-- Cotação ganha status CANCELADA (cancelar a compra inteira, inclusive a que
-- só tem cotação). Antes ela era marcada CONCLUIDA e a compra parecia concluída.
ALTER TYPE "StatusCotacaoCompra" ADD VALUE IF NOT EXISTS 'CANCELADA';
