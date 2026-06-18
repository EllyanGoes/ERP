-- Material a Entregar (2.1.2) passa a ser SINTÉTICA: o saldo fica em analíticas
-- por cliente (2.1.2.NNNN), espelhando Fornecedores a Pagar (2.1.1). As analíticas
-- por cliente são criadas em runtime pelo motor (contabilizarVendaPedido /
-- contabilizarReceitaMinuta) no reprocesso. Idempotente.
UPDATE "ContaContabil"
SET "tipo" = 'SINTETICA', "aceitaLancamento" = false
WHERE "codigo" = '2.1.2' AND "tipo" <> 'SINTETICA';
