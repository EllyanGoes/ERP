-- Desconto na baixa do Contas a Pagar: natureza TRAVADA "descontos-recebidos"
-- (pagou MENOS e quitou o título; o contábil credita Descontos Obtidos 3.1.9005
-- — mesmo caminho da taxa retida). Já existia só na Cimento e Mix (padronização
-- Nibo). Semeia nas demais empresas que já têm naturezas travadas do sistema.
-- Aditivo e idempotente (re-rodar não duplica).

-- 1) Empresas com o plano hierárquico (grupo "1. Receitas" com código): entra
--    como 1.06 "Descontos obtidos" no grupo 1, igual às 1.0x (Tramontin).
INSERT INTO "NaturezaFinanceira" (
  id, "empresaId", codigo, nome, tipo, grupo, "subgrupoId", ativo, "afetaResultado",
  "sistema", "sistemaChave", "aplicavelRequisicao", cif, ordem, "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, s."empresaId", '1.06', 'Descontos obtidos',
  'ENTRADA'::"NaturezaTipo", 'RECEITA_OPERACIONAL'::"NaturezaGrupo", s.id, true, true,
  true, 'descontos-recebidos', false, false, 106, now(), now()
FROM "NaturezaSubgrupo" s
WHERE s.nome = '1. Receitas'
  AND EXISTS (
    SELECT 1 FROM "NaturezaFinanceira" n
    WHERE n."empresaId" = s."empresaId" AND n.codigo = '1.05'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "NaturezaFinanceira" n
    WHERE n."empresaId" = s."empresaId" AND (n."sistemaChave" = 'descontos-recebidos' OR n.codigo = '1.06')
  );

-- 2) Demais empresas com naturezas travadas (sem plano com código — ex.: Atlas):
--    natureza sem código, como as outras chaves travadas.
INSERT INTO "NaturezaFinanceira" (
  id, "empresaId", nome, tipo, grupo, ativo, "sistema", "sistemaChave",
  "aplicavelRequisicao", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, e.id, 'Descontos Recebidos',
  'ENTRADA'::"NaturezaTipo", 'RECEITA_OPERACIONAL'::"NaturezaGrupo", true,
  true, 'descontos-recebidos', false, now(), now()
FROM "Empresa" e
WHERE EXISTS (
    SELECT 1 FROM "NaturezaFinanceira" n
    WHERE n."empresaId" = e.id AND n."sistema" = true AND n."sistemaChave" IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "NaturezaFinanceira" n
    WHERE n."empresaId" = e.id AND n."sistemaChave" = 'descontos-recebidos'
  );
