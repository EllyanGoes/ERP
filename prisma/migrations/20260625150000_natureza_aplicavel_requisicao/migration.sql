ALTER TABLE "NaturezaFinanceira" ADD COLUMN IF NOT EXISTS "aplicavelRequisicao" BOOLEAN NOT NULL DEFAULT false;

-- Marca as naturezas de CONSUMO de almoxarifado da Tramontin como requisitáveis.
-- Idempotente; não apaga nem desativa nada. Demais empresas/naturezas seguem false.
UPDATE "NaturezaFinanceira"
SET "aplicavelRequisicao" = true
WHERE "empresaId" = 'emp_tramontin'
  AND tipo = 'SAIDA'
  AND nome IN (
    'Combustível (produção)', 'Insumos de Queima', 'Material de segurança',
    'Abrasivos', 'Lubrificante', 'Material elétrico', 'Peças de reposição',
    'Refratário', 'Solda', 'Material de consumo geral',
    'Material de escritório/TI', 'Material de limpeza'
  );
