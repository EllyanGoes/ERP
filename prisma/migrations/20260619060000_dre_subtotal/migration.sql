-- Linha "=" na DRE (resultado acumulado: Receita Líquida, Margem Bruta, EBITDA…). Idempotente.
ALTER TYPE "DREOperacao" ADD VALUE IF NOT EXISTS 'SUBTOTAL';
