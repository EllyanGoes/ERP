-- Bens a Entregar analítico por cliente (1.1.4.x), espelho do Material a Entregar.
-- Um cliente passa a ter duas analíticas ATIVO (1.1.2.x e 1.1.4.x), então a
-- unicidade da analítica de entidade deixa de ser por (empresa, grupo, cliente)
-- e passa a ser por (empresa, pai, cliente). Idempotente.

-- 1) 1.1.4 vira sintética (não aceita lançamento direto — só as analíticas por cliente).
UPDATE "ContaContabil"
SET tipo = 'SINTETICA'::"TipoContaContabil", "aceitaLancamento" = false
WHERE codigo = '1.1.4' AND tipo <> 'SINTETICA';

-- 2) Troca a unicidade de (empresa, grupo, cliente) para (empresa, pai, cliente).
DROP INDEX IF EXISTS "ContaContabil_empresaId_grupo_clienteId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ContaContabil_empresaId_paiId_clienteId_key"
  ON "ContaContabil" ("empresaId", "paiId", "clienteId");
