-- Desconto na baixa do Contas a Receber: natureza TRAVADA "descontos-concedidos"
-- (recebeu MENOS e quitou o título — taxa retida com esta natureza). Já existia
-- só na Cimento e Mix (padronização Nibo, ligada à conta 3.1.0005 de lá). Semeia
-- nas demais empresas que já têm naturezas travadas e liga a natureza nova à
-- conta "(-) Descontos Concedidos" (3.1.9003, redutora de receita) quando a
-- conta existe e está livre — o contábil do recebimento debita a conta da
-- natureza da taxa (contaDaNatureza), então o desconto cai em 3.1.9003.
-- Aditivo e idempotente (re-rodar não duplica nem re-liga).

-- 1) Empresas com o plano hierárquico (grupo "6. Financeiras" com 6.06): entra
--    como 6.07 "Descontos concedidos", igual às 6.0x (Tramontin).
INSERT INTO "NaturezaFinanceira" (
  id, "empresaId", codigo, nome, tipo, grupo, "subgrupoId", ativo, "afetaResultado",
  "sistema", "sistemaChave", "aplicavelRequisicao", cif, ordem, "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, s."empresaId", '6.07', 'Descontos concedidos',
  'SAIDA'::"NaturezaTipo", 'DESPESA_OPERACIONAL'::"NaturezaGrupo", s.id, true, true,
  true, 'descontos-concedidos', false, false, 607, now(), now()
FROM "NaturezaSubgrupo" s
WHERE s.nome = '6. Financeiras'
  AND EXISTS (
    SELECT 1 FROM "NaturezaFinanceira" n
    WHERE n."empresaId" = s."empresaId" AND n.codigo = '6.06'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "NaturezaFinanceira" n
    WHERE n."empresaId" = s."empresaId" AND (n."sistemaChave" = 'descontos-concedidos' OR n.codigo = '6.07')
  );

-- 2) Demais empresas com naturezas travadas (sem plano com código — ex.: Atlas):
--    natureza sem código, como a da Cimento e Mix.
INSERT INTO "NaturezaFinanceira" (
  id, "empresaId", nome, tipo, grupo, ativo, "sistema", "sistemaChave",
  "aplicavelRequisicao", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, e.id, 'Descontos Concedidos',
  'SAIDA'::"NaturezaTipo", 'RECEITA_OPERACIONAL'::"NaturezaGrupo", true,
  true, 'descontos-concedidos', false, now(), now()
FROM "Empresa" e
WHERE EXISTS (
    SELECT 1 FROM "NaturezaFinanceira" n
    WHERE n."empresaId" = e.id AND n."sistema" = true AND n."sistemaChave" IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "NaturezaFinanceira" n
    WHERE n."empresaId" = e.id AND n."sistemaChave" = 'descontos-concedidos'
  );

-- 3) Conta de resultado: liga 3.1.9003 "(-) Descontos Concedidos" à natureza
--    quando a natureza ainda não tem conta (a da Cimento e Mix já tem 3.1.0005 —
--    fica como está) e a 3.1.9003 não está ligada a outra natureza.
UPDATE "ContaContabil" c
SET "naturezaFinanceiraId" = n.id, "updatedAt" = now()
FROM "NaturezaFinanceira" n
WHERE n."sistemaChave" = 'descontos-concedidos'
  AND c."empresaId" = n."empresaId"
  AND c.codigo = '3.1.9003'
  AND c."naturezaFinanceiraId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ContaContabil" x WHERE x."naturezaFinanceiraId" = n.id
  );
