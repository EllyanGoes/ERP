-- Número ÚNICO da compra (PC-0001…): SC, CT, PC e DE do mesmo processo passam a
-- carregar o mesmo numeroCompra, numerado pela ORDEM DE CRIAÇÃO do processo
-- (decisão do dono, 24/11/2026). Os pedidos existentes são RENUMERADOS para
-- seguir essa ordem: o número antigo fica em PedidoCompra.numeroAntigo e os
-- textos que o citam (títulos a pagar, históricos contábeis, notificações) são
-- atualizados. Backup de tudo em _bkp_numero_compra_20261124_*.
-- Idempotente: o backfill só roda enquanto nenhum documento tem numeroCompra.

ALTER TABLE "NecessidadeCompra" ADD COLUMN IF NOT EXISTS "numeroCompra" TEXT;
ALTER TABLE "CotacaoCompra"     ADD COLUMN IF NOT EXISTS "numeroCompra" TEXT;
ALTER TABLE "PedidoCompra"      ADD COLUMN IF NOT EXISTS "numeroCompra" TEXT;
ALTER TABLE "PedidoCompra"      ADD COLUMN IF NOT EXISTS "numeroAntigo" TEXT;
ALTER TABLE "ConferenciaCompra" ADD COLUMN IF NOT EXISTS "numeroCompra" TEXT;

CREATE INDEX IF NOT EXISTS "NecessidadeCompra_empresaId_numeroCompra_idx" ON "NecessidadeCompra"("empresaId", "numeroCompra");
CREATE INDEX IF NOT EXISTS "CotacaoCompra_empresaId_numeroCompra_idx"     ON "CotacaoCompra"("empresaId", "numeroCompra");
CREATE INDEX IF NOT EXISTS "PedidoCompra_empresaId_numeroCompra_idx"      ON "PedidoCompra"("empresaId", "numeroCompra");
CREATE INDEX IF NOT EXISTS "ConferenciaCompra_empresaId_numeroCompra_idx" ON "ConferenciaCompra"("empresaId", "numeroCompra");

-- Troca, num texto, cada PC-NNNN antigo pelo novo (uma passada só, token a token,
-- para PC-0191→PC-0350 não colidir com PC-0350→PC-0412). empresa NULL = só troca
-- números que existem em uma única empresa (notificação não tem empresa).
CREATE OR REPLACE FUNCTION pg_temp._troca_pc(txt TEXT, emp TEXT) RETURNS TEXT AS $f$
DECLARE
  m TEXT; novo TEXT; res TEXT := ''; resto TEXT := txt; pos INT;
BEGIN
  IF txt IS NULL THEN RETURN NULL; END IF;
  LOOP
    m := (regexp_match(resto, 'PC-[0-9]{4,}'))[1];
    EXIT WHEN m IS NULL;
    pos := position(m IN resto);
    -- Não mexe em "PC-0191/2" nem em dígitos colados (PC-01910).
    novo := NULL;
    IF substr(resto, pos + length(m), 1) !~ '[0-9/]' OR substr(resto, pos + length(m), 1) = '' THEN
      SELECT mp.novo INTO novo FROM _pc_map mp
       WHERE mp.antigo = m AND ((emp IS NOT NULL AND mp."empresaId" = emp) OR (emp IS NULL AND mp.unico))
       LIMIT 1;
    END IF;
    res := res || substr(resto, 1, pos - 1) || COALESCE(novo, m);
    resto := substr(resto, pos + length(m));
  END LOOP;
  RETURN res || resto;
END
$f$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "NecessidadeCompra" WHERE "numeroCompra" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "CotacaoCompra" WHERE "numeroCompra" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "PedidoCompra" WHERE "numeroCompra" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "ConferenciaCompra" WHERE "numeroCompra" IS NOT NULL) THEN
    RAISE NOTICE 'numeroCompra já preenchido — backfill ignorado';
    RETURN;
  END IF;

  -- 1) Cada documento aponta para a RAIZ do seu processo (mesma regra do kanban):
  --    SC da cotação/pedido > CT sem SC > PC sem origem > DE avulso.
  CREATE TEMP TABLE _compra_doc AS
  SELECT 'SC'::text AS tipo, n.id, n."empresaId", n."createdAt", 'SC:' || n.id AS raiz
    FROM "NecessidadeCompra" n
  UNION ALL
  SELECT 'CT', c.id, c."empresaId", c."createdAt",
         CASE WHEN c."necessidadeId" IS NOT NULL THEN 'SC:' || c."necessidadeId" ELSE 'CT:' || c.id END
    FROM "CotacaoCompra" c
  UNION ALL
  SELECT 'PC', p.id, p."empresaId", p."createdAt",
         CASE
           WHEN COALESCE(ct."necessidadeId", p."necessidadeId") IS NOT NULL THEN 'SC:' || COALESCE(ct."necessidadeId", p."necessidadeId")
           WHEN p."cotacaoId" IS NOT NULL THEN 'CT:' || p."cotacaoId"
           ELSE 'PC:' || p.id
         END
    FROM "PedidoCompra" p LEFT JOIN "CotacaoCompra" ct ON ct.id = p."cotacaoId"
  UNION ALL
  SELECT 'DE', d.id, d."empresaId", d."createdAt", 'DE:' || d.id
    FROM "ConferenciaCompra" d WHERE d."pedidoId" IS NULL;

  INSERT INTO _compra_doc
  SELECT 'DE', d.id, d."empresaId", d."createdAt", pd.raiz
    FROM "ConferenciaCompra" d
    JOIN _compra_doc pd ON pd.tipo = 'PC' AND pd.id = d."pedidoId";

  -- 2) Número de cada processo pela ordem de criação (1º documento), por empresa.
  CREATE TEMP TABLE _compra_raiz AS
  SELECT raiz, "empresaId",
         'PC-' || LPAD(ROW_NUMBER() OVER (PARTITION BY "empresaId" ORDER BY criado, raiz)::text, 4, '0') AS numero
    FROM (SELECT raiz, MIN("empresaId") AS "empresaId", MIN("createdAt") AS criado
            FROM _compra_doc GROUP BY raiz) r;

  -- 3) Novo número de cada pedido: o da compra; 2º pedido do processo vira /2…
  CREATE TEMP TABLE _pc_map AS
  SELECT p.id, p."empresaId", p.numero AS antigo,
         r.numero AS "numeroCompra",
         CASE WHEN ROW_NUMBER() OVER (PARTITION BY d.raiz ORDER BY p."createdAt", p.id) = 1 THEN r.numero
              ELSE r.numero || '/' || ROW_NUMBER() OVER (PARTITION BY d.raiz ORDER BY p."createdAt", p.id) END AS novo,
         FALSE AS unico
    FROM "PedidoCompra" p
    JOIN _compra_doc d ON d.tipo = 'PC' AND d.id = p.id
    JOIN _compra_raiz r ON r.raiz = d.raiz;
  UPDATE _pc_map m SET unico = (SELECT COUNT(*) FROM _pc_map x WHERE x.antigo = m.antigo) = 1;

  -- 4) Backup do que vai mudar.
  CREATE TABLE IF NOT EXISTS "_bkp_numero_compra_20261124_pedido" AS
    SELECT id, "empresaId", numero FROM "PedidoCompra";
  CREATE TABLE IF NOT EXISTS "_bkp_numero_compra_20261124_contapagar" AS
    SELECT id, "empresaId", descricao FROM "ContaPagar" WHERE descricao ~ 'PC-[0-9]{4}';
  CREATE TABLE IF NOT EXISTS "_bkp_numero_compra_20261124_lancamento" AS
    SELECT id, "empresaId", historico FROM "LancamentoContabil" WHERE historico ~ 'PC-[0-9]{4}';
  CREATE TABLE IF NOT EXISTS "_bkp_numero_compra_20261124_notificacao" AS
    SELECT id, titulo, mensagem FROM "Notificacao" WHERE titulo ~ 'PC-[0-9]{4}' OR mensagem ~ 'PC-[0-9]{4}';

  -- 5) Textos que citam o número antigo (antes de renumerar, para ler o mapa).
  UPDATE "ContaPagar" SET descricao = pg_temp._troca_pc(descricao, "empresaId")
   WHERE descricao ~ 'PC-[0-9]{4}';
  UPDATE "LancamentoContabil" SET historico = pg_temp._troca_pc(historico, "empresaId")
   WHERE historico ~ 'PC-[0-9]{4}';
  UPDATE "Notificacao" SET titulo = pg_temp._troca_pc(titulo, NULL), mensagem = pg_temp._troca_pc(mensagem, NULL)
   WHERE titulo ~ 'PC-[0-9]{4}' OR mensagem ~ 'PC-[0-9]{4}';

  -- 6) Renumera os pedidos em duas passadas (o unique empresaId+numero não deixa
  --    trocar PC-0191↔PC-0350 direto).
  UPDATE "PedidoCompra" p SET numero = 'TMP-' || p.id FROM _pc_map m WHERE m.id = p.id;
  UPDATE "PedidoCompra" p SET numero = m.novo, "numeroAntigo" = m.antigo, "numeroCompra" = m."numeroCompra"
    FROM _pc_map m WHERE m.id = p.id;

  -- 7) Demais documentos.
  UPDATE "NecessidadeCompra" t SET "numeroCompra" = r.numero
    FROM _compra_doc d JOIN _compra_raiz r ON r.raiz = d.raiz WHERE d.tipo = 'SC' AND t.id = d.id;
  UPDATE "CotacaoCompra" t SET "numeroCompra" = r.numero
    FROM _compra_doc d JOIN _compra_raiz r ON r.raiz = d.raiz WHERE d.tipo = 'CT' AND t.id = d.id;
  UPDATE "ConferenciaCompra" t SET "numeroCompra" = r.numero
    FROM _compra_doc d JOIN _compra_raiz r ON r.raiz = d.raiz WHERE d.tipo = 'DE' AND t.id = d.id;

  -- 8) Sequência "PC" continua depois do maior número usado.
  INSERT INTO "Sequencia" ("empresaId", prefixo, ultimo)
  SELECT "empresaId", 'PC', COUNT(*) FROM _compra_raiz GROUP BY "empresaId"
  ON CONFLICT ("empresaId", prefixo) DO UPDATE SET ultimo = GREATEST("Sequencia".ultimo, EXCLUDED.ultimo);

  DROP TABLE _compra_doc;
  DROP TABLE _compra_raiz;
  DROP TABLE _pc_map;
END
$$;
