-- Mão de obra INDIRETA (MOI) nos parâmetros de custeio: entra no pool de CIF.
ALTER TABLE "ParametroCusteio" ADD COLUMN IF NOT EXISTS "folhaMoiMes" DECIMAL(15,2) NOT NULL DEFAULT 0;
