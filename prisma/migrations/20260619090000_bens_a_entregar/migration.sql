-- Conta de controle "Bens a Entregar" (1.1.4, ATIVO) por empresa — contrapartida
-- ativa do "Material a Entregar" na confirmação do pedido. O recebível (Clientes
-- a Receber) passa a nascer só na entrega (com o título), convergindo contábil e
-- financeiro. Idempotente: só cria onde ainda não existe e onde há o pai 1.1.
INSERT INTO "ContaContabil" (id, "empresaId", codigo, nome, grupo, natureza, tipo, nivel, "aceitaLancamento", "paiId", ativo, "createdAt", "updatedAt")
SELECT 'cc_bens_entregar_' || pai."empresaId", pai."empresaId", '1.1.4', 'Bens a Entregar',
       'ATIVO'::"GrupoContabil", 'DEVEDORA'::"NaturezaContabil", 'ANALITICA'::"TipoContaContabil",
       pai.nivel + 1, true, pai.id, true, now(), now()
FROM "ContaContabil" pai
WHERE pai.codigo = '1.1'
  AND NOT EXISTS (
    SELECT 1 FROM "ContaContabil" c WHERE c."empresaId" = pai."empresaId" AND c.codigo = '1.1.4'
  );
