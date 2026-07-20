-- Centros de custo: o flag FABRIL passa a ser do GRUPO (fonte da verdade) e o
-- centro herda (CentroCusto.fabril vira coluna sincronizada — consultas do
-- motor intactas). + descricaoCusteio: nota de custeio no cabeçalho do grupo.
-- O seed (flags por grupo, grupo Extração, AUX-09, checagem de divergência)
-- roda à parte — divergência flag×grupo é decisão manual, nunca sobrescrita
-- silenciosamente. Idempotente.

ALTER TABLE "GrupoCentroCusto" ADD COLUMN IF NOT EXISTS "fabril" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GrupoCentroCusto" ADD COLUMN IF NOT EXISTS "descricaoCusteio" TEXT;
