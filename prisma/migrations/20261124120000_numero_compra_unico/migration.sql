-- Número ÚNICO da compra (PC-0430): SC, CT, PC e DE do mesmo processo passam a
-- carregar o mesmo numeroCompra. Idempotente: só preenche onde está vazio.

ALTER TABLE "NecessidadeCompra" ADD COLUMN IF NOT EXISTS "numeroCompra" TEXT;
ALTER TABLE "CotacaoCompra"     ADD COLUMN IF NOT EXISTS "numeroCompra" TEXT;
ALTER TABLE "PedidoCompra"      ADD COLUMN IF NOT EXISTS "numeroCompra" TEXT;
ALTER TABLE "ConferenciaCompra" ADD COLUMN IF NOT EXISTS "numeroCompra" TEXT;

CREATE INDEX IF NOT EXISTS "NecessidadeCompra_empresaId_numeroCompra_idx" ON "NecessidadeCompra"("empresaId", "numeroCompra");
CREATE INDEX IF NOT EXISTS "CotacaoCompra_empresaId_numeroCompra_idx"     ON "CotacaoCompra"("empresaId", "numeroCompra");
CREATE INDEX IF NOT EXISTS "PedidoCompra_empresaId_numeroCompra_idx"      ON "PedidoCompra"("empresaId", "numeroCompra");
CREATE INDEX IF NOT EXISTS "ConferenciaCompra_empresaId_numeroCompra_idx" ON "ConferenciaCompra"("empresaId", "numeroCompra");

-- ── Backfill ────────────────────────────────────────────────────────────────
-- 1) Cada documento aponta para a RAIZ do seu processo (mesma regra do kanban):
--    SC da cotação/pedido > CT sem SC > PC sem origem > DE avulso.
DROP TABLE IF EXISTS _compra_doc;
DROP TABLE IF EXISTS _compra_raiz;
CREATE TEMP TABLE _compra_doc AS
SELECT 'SC' AS tipo, n.id, n."empresaId", n."createdAt", 'SC:' || n.id AS raiz
  FROM "NecessidadeCompra" n WHERE n."numeroCompra" IS NULL
UNION ALL
SELECT 'CT', c.id, c."empresaId", c."createdAt",
       CASE WHEN c."necessidadeId" IS NOT NULL THEN 'SC:' || c."necessidadeId" ELSE 'CT:' || c.id END
  FROM "CotacaoCompra" c WHERE c."numeroCompra" IS NULL
UNION ALL
SELECT 'PC', p.id, p."empresaId", p."createdAt",
       CASE
         WHEN COALESCE(ct."necessidadeId", p."necessidadeId") IS NOT NULL THEN 'SC:' || COALESCE(ct."necessidadeId", p."necessidadeId")
         WHEN p."cotacaoId" IS NOT NULL THEN 'CT:' || p."cotacaoId"
         ELSE 'PC:' || p.id
       END
  FROM "PedidoCompra" p LEFT JOIN "CotacaoCompra" ct ON ct.id = p."cotacaoId"
 WHERE p."numeroCompra" IS NULL
UNION ALL
SELECT 'DE', d.id, d."empresaId", d."createdAt", 'DE:' || d.id
  FROM "ConferenciaCompra" d WHERE d."numeroCompra" IS NULL AND d."pedidoId" IS NULL;

-- DE de pedido herda a raiz do pedido.
INSERT INTO _compra_doc
SELECT 'DE', d.id, d."empresaId", d."createdAt", pd.raiz
  FROM "ConferenciaCompra" d
  JOIN _compra_doc pd ON pd.tipo = 'PC' AND pd.id = d."pedidoId"
 WHERE d."numeroCompra" IS NULL;

-- 2) Número da raiz: o do primeiro pedido vivo (senão o primeiro pedido).
CREATE TEMP TABLE _compra_raiz AS
SELECT DISTINCT ON (doc.raiz) doc.raiz, p.numero AS numero
  FROM _compra_doc doc JOIN "PedidoCompra" p ON doc.tipo = 'PC' AND p.id = doc.id
 ORDER BY doc.raiz, (p.status = 'CANCELADO'), p."createdAt", p.numero;

-- 3) Raiz sem pedido: número novo da sequência "PC", em ordem cronológica.
WITH sem AS (
  SELECT doc.raiz, MIN(doc."empresaId") AS "empresaId", MIN(doc."createdAt") AS criado
    FROM _compra_doc doc
   WHERE NOT EXISTS (SELECT 1 FROM _compra_raiz r WHERE r.raiz = doc.raiz)
   GROUP BY doc.raiz
), base AS (
  SELECT e."empresaId", COALESCE(s.ultimo, 0) AS ultimo
    FROM (SELECT DISTINCT "empresaId" FROM sem) e
    LEFT JOIN "Sequencia" s ON s."empresaId" = e."empresaId" AND s.prefixo = 'PC'
)
INSERT INTO _compra_raiz
SELECT sem.raiz,
       'PC-' || LPAD((base.ultimo + ROW_NUMBER() OVER (PARTITION BY sem."empresaId" ORDER BY sem.criado, sem.raiz))::text, 4, '0')
  FROM sem JOIN base ON base."empresaId" = sem."empresaId";

-- Sequência avança até o maior número usado (inclusive os já existentes).
INSERT INTO "Sequencia" ("empresaId", prefixo, ultimo)
SELECT doc."empresaId", 'PC', MAX(SUBSTRING(r.numero FROM 4)::int)
  FROM _compra_raiz r JOIN _compra_doc doc ON doc.raiz = r.raiz
 WHERE r.numero ~ '^PC-[0-9]+$'
 GROUP BY doc."empresaId"
ON CONFLICT ("empresaId", prefixo) DO UPDATE SET ultimo = GREATEST("Sequencia".ultimo, EXCLUDED.ultimo);

-- 4) Grava.
UPDATE "NecessidadeCompra" t SET "numeroCompra" = r.numero
  FROM _compra_doc d JOIN _compra_raiz r ON r.raiz = d.raiz
 WHERE d.tipo = 'SC' AND t.id = d.id AND t."numeroCompra" IS NULL;
UPDATE "CotacaoCompra" t SET "numeroCompra" = r.numero
  FROM _compra_doc d JOIN _compra_raiz r ON r.raiz = d.raiz
 WHERE d.tipo = 'CT' AND t.id = d.id AND t."numeroCompra" IS NULL;
UPDATE "PedidoCompra" t SET "numeroCompra" = r.numero
  FROM _compra_doc d JOIN _compra_raiz r ON r.raiz = d.raiz
 WHERE d.tipo = 'PC' AND t.id = d.id AND t."numeroCompra" IS NULL;
UPDATE "ConferenciaCompra" t SET "numeroCompra" = r.numero
  FROM _compra_doc d JOIN _compra_raiz r ON r.raiz = d.raiz
 WHERE d.tipo = 'DE' AND t.id = d.id AND t."numeroCompra" IS NULL;

-- DE de pedido que já tinha número (reexecução parcial) herda do pedido.
UPDATE "ConferenciaCompra" d SET "numeroCompra" = p."numeroCompra"
  FROM "PedidoCompra" p
 WHERE p.id = d."pedidoId" AND d."numeroCompra" IS NULL AND p."numeroCompra" IS NOT NULL;

DROP TABLE IF EXISTS _compra_doc;
DROP TABLE IF EXISTS _compra_raiz;
