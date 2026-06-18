-- 1.1.1 "Caixa e Bancos" → "Disponibilidades"; o caixa/bancos passa a ficar
-- detalhado por conta bancária (analíticas sob 1.1.1). Reclassifica as partidas
-- que estavam na sintética 1.1.1 para a analítica "Caixa em Dinheiro" da empresa
-- (para a árvore mostrar o detalhe, como em Clientes a Receber). Idempotente.

UPDATE "ContaContabil" SET "nome" = 'Disponibilidades'
WHERE "codigo" = '1.1.1' AND "nome" <> 'Disponibilidades';

UPDATE "PartidaContabil" pt SET "contaId" = ana."id"
FROM "ContaContabil" sint
JOIN "ContaContabil" ana
  ON ana."empresaId" = sint."empresaId"
 AND ana."contaBancariaId" = CASE WHEN sint."empresaId" = 'emp_tramontin' THEN 'caixa-geral' ELSE 'caixa-'||sint."empresaId" END
WHERE sint."codigo" = '1.1.1' AND pt."contaId" = sint."id";
