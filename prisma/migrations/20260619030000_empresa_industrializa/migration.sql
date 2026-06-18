-- Flag de indústria por empresa: só fábrica usa CPV; pura revenda lança tudo em
-- CMV. Idempotente. Corrige o histórico (Cimento e Mix tinha CPV indevido).
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "industrializa" boolean NOT NULL DEFAULT false;

UPDATE "Empresa" SET "industrializa" = true WHERE id = 'emp_tramontin';

-- Empresas de revenda pura: mover as partidas de CPV (3.2.2.0001) para CMV (3.2.1.0001).
UPDATE "PartidaContabil" pa SET "contaId" = cmv.id
FROM "Empresa" e
JOIN "ContaContabil" cpv ON cpv."empresaId" = e.id AND cpv.codigo = '3.2.2.0001'
JOIN "ContaContabil" cmv ON cmv."empresaId" = e.id AND cmv.codigo = '3.2.1.0001'
WHERE e."industrializa" = false AND pa."contaId" = cpv.id;

-- Desativar a estrutura de CPV nas empresas que não industrializam (não se aplica a elas).
UPDATE "ContaContabil" cc SET ativo = false
FROM "Empresa" e
WHERE cc."empresaId" = e.id AND e."industrializa" = false
  AND cc.codigo IN ('3.2.2','3.2.2.0001');
