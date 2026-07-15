-- Centro de custo POR EMPRESA: cada empresa passa a ter sua própria lista.
--
-- Backfill: o catálogo existente (fabril, criado para a cerâmica) fica com a
-- Tramontin; para cada OUTRA empresa que já referencia um centro em documentos
-- (títulos, lançamentos, requisições, compras, TES), cria-se uma CÓPIA do
-- centro naquela empresa (id determinístico = id original + '_' + empresaId) e
-- as referências dessa empresa são remapeadas para a cópia. Unique passa de
-- codigo (global) para (empresaId, codigo). Idempotente.

-- 1) Coluna empresaId (nullable até o backfill).
ALTER TABLE "CentroCusto" ADD COLUMN IF NOT EXISTS "empresaId" TEXT;

-- 2) Catálogo existente → Tramontin (fallback: primeira empresa, p/ bases de dev).
UPDATE "CentroCusto"
SET "empresaId" = COALESCE(
  (SELECT id FROM "Empresa" WHERE id = 'emp_tramontin'),
  (SELECT id FROM "Empresa" ORDER BY "createdAt" LIMIT 1)
)
WHERE "empresaId" IS NULL;

-- 3) Troca o unique ANTES das cópias: o global antigo (codigo) impediria criar
--    o mesmo código em outra empresa. O composto (empresaId, codigo) entra já
--    aqui para proteger as inserções abaixo.
DROP INDEX IF EXISTS "CentroCusto_codigo_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CentroCusto_empresaId_codigo_key" ON "CentroCusto"("empresaId", "codigo");

-- 4) Cópias por empresa usuária: união de TODAS as tabelas que referenciam
--    centro de custo, com a empresa do documento (itens herdam do pai).
WITH uso AS (
  SELECT "centroCustoId" AS cc, "empresaId" AS emp FROM "LancamentoCaixa" WHERE "centroCustoId" IS NOT NULL
  UNION SELECT "centroCustoId", "empresaId" FROM "ContaReceber"       WHERE "centroCustoId" IS NOT NULL
  UNION SELECT "centroCustoId", "empresaId" FROM "ContaPagar"         WHERE "centroCustoId" IS NOT NULL
  UNION SELECT "centroCustoId", "empresaId" FROM "Recorrencia"        WHERE "centroCustoId" IS NOT NULL
  UNION SELECT "centroCustoId", "empresaId" FROM "NecessidadeCompra"  WHERE "centroCustoId" IS NOT NULL
  UNION SELECT "centroCustoId", "empresaId" FROM "RequisicaoMaterial" WHERE "centroCustoId" IS NOT NULL
  UNION SELECT ri."centroCustoId", r."empresaId"
        FROM "RequisicaoMaterialItem" ri JOIN "RequisicaoMaterial" r ON r.id = ri."requisicaoId"
        WHERE ri."centroCustoId" IS NOT NULL
  UNION SELECT i."centroCustoId", p."empresaId"
        FROM "PedidoCompraItem" i JOIN "PedidoCompra" p ON p.id = i."pedidoId"
        WHERE i."centroCustoId" IS NOT NULL
  UNION SELECT "centroCustoId", "empresaId" FROM "ConferenciaCompraItem" WHERE "centroCustoId" IS NOT NULL
  UNION SELECT "centroCustoSugeridoId", "empresaId" FROM "TipoOperacao" WHERE "centroCustoSugeridoId" IS NOT NULL
)
INSERT INTO "CentroCusto" (id, codigo, nome, "grupoCentroCustoId", ativo, fabril, "empresaId", "createdAt", "updatedAt")
SELECT cc.id || '_' || u.emp, cc.codigo, cc.nome, cc."grupoCentroCustoId", cc.ativo, cc.fabril, u.emp, now(), now()
FROM uso u
JOIN "CentroCusto" cc ON cc.id = u.cc
WHERE u.emp IS NOT NULL AND u.emp <> cc."empresaId"
ON CONFLICT (id) DO NOTHING;

-- 5) Remapeia as referências de cada empresa para o centro DELA (mesmo código).
UPDATE "LancamentoCaixa" t SET "centroCustoId" = cc2.id
FROM "CentroCusto" cc1 JOIN "CentroCusto" cc2 ON cc2.codigo = cc1.codigo
WHERE t."centroCustoId" = cc1.id AND cc1."empresaId" <> t."empresaId" AND cc2."empresaId" = t."empresaId";

UPDATE "ContaReceber" t SET "centroCustoId" = cc2.id
FROM "CentroCusto" cc1 JOIN "CentroCusto" cc2 ON cc2.codigo = cc1.codigo
WHERE t."centroCustoId" = cc1.id AND cc1."empresaId" <> t."empresaId" AND cc2."empresaId" = t."empresaId";

UPDATE "ContaPagar" t SET "centroCustoId" = cc2.id
FROM "CentroCusto" cc1 JOIN "CentroCusto" cc2 ON cc2.codigo = cc1.codigo
WHERE t."centroCustoId" = cc1.id AND cc1."empresaId" <> t."empresaId" AND cc2."empresaId" = t."empresaId";

UPDATE "Recorrencia" t SET "centroCustoId" = cc2.id
FROM "CentroCusto" cc1 JOIN "CentroCusto" cc2 ON cc2.codigo = cc1.codigo
WHERE t."centroCustoId" = cc1.id AND cc1."empresaId" <> t."empresaId" AND cc2."empresaId" = t."empresaId";

UPDATE "NecessidadeCompra" t SET "centroCustoId" = cc2.id
FROM "CentroCusto" cc1 JOIN "CentroCusto" cc2 ON cc2.codigo = cc1.codigo
WHERE t."centroCustoId" = cc1.id AND cc1."empresaId" <> t."empresaId" AND cc2."empresaId" = t."empresaId";

UPDATE "RequisicaoMaterial" t SET "centroCustoId" = cc2.id
FROM "CentroCusto" cc1 JOIN "CentroCusto" cc2 ON cc2.codigo = cc1.codigo
WHERE t."centroCustoId" = cc1.id AND cc1."empresaId" <> t."empresaId" AND cc2."empresaId" = t."empresaId";

UPDATE "RequisicaoMaterialItem" ri SET "centroCustoId" = cc2.id
FROM "RequisicaoMaterial" r, "CentroCusto" cc1, "CentroCusto" cc2
WHERE r.id = ri."requisicaoId" AND ri."centroCustoId" = cc1.id
  AND cc1."empresaId" <> r."empresaId"
  AND cc2.codigo = cc1.codigo AND cc2."empresaId" = r."empresaId";

UPDATE "PedidoCompraItem" i SET "centroCustoId" = cc2.id
FROM "PedidoCompra" p, "CentroCusto" cc1, "CentroCusto" cc2
WHERE p.id = i."pedidoId" AND i."centroCustoId" = cc1.id
  AND cc1."empresaId" <> p."empresaId"
  AND cc2.codigo = cc1.codigo AND cc2."empresaId" = p."empresaId";

UPDATE "ConferenciaCompraItem" t SET "centroCustoId" = cc2.id
FROM "CentroCusto" cc1 JOIN "CentroCusto" cc2 ON cc2.codigo = cc1.codigo
WHERE t."centroCustoId" = cc1.id AND cc1."empresaId" <> t."empresaId" AND cc2."empresaId" = t."empresaId";

UPDATE "TipoOperacao" t SET "centroCustoSugeridoId" = cc2.id
FROM "CentroCusto" cc1 JOIN "CentroCusto" cc2 ON cc2.codigo = cc1.codigo
WHERE t."centroCustoSugeridoId" = cc1.id AND cc1."empresaId" <> t."empresaId" AND cc2."empresaId" = t."empresaId";

-- 6) NOT NULL + default nominal (padrão da Fase 1; o proxy carimba a empresa
--    ativa em runtime) + FK + índice de escopo.
ALTER TABLE "CentroCusto" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "CentroCusto" ALTER COLUMN "empresaId" SET DEFAULT 'emp_tramontin';

DO $$ BEGIN
  ALTER TABLE "CentroCusto" ADD CONSTRAINT "CentroCusto_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "CentroCusto_empresaId_idx" ON "CentroCusto"("empresaId");
