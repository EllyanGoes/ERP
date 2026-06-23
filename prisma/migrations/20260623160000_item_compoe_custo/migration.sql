-- Flag de insumo que NÃO compõe custo nem saldo de produção (ex.: água).
-- Insumos com compoeCusto=false são ignorados no consumo/custeio do PCP.
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "compoeCusto" BOOLEAN NOT NULL DEFAULT true;
