-- Um cliente pode ter conta em dois grupos: Clientes a Receber (ATIVO, 1.1.2.x) e
-- Material a Entregar (PASSIVO, 2.1.2.x). A unique antiga (empresaId, clienteId)
-- impedia o segundo. Inclui o grupo no key. Idempotente.
DROP INDEX IF EXISTS "ContaContabil_empresaId_clienteId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ContaContabil_empresaId_grupo_clienteId_key"
  ON "ContaContabil" ("empresaId", "grupo", "clienteId");
