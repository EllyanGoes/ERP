-- Dimensões independentes do pedido: entrega (minutas) e financeiro (contas a
-- receber). Enums + colunas em PedidoVenda + FK opcional p/ a condição de
-- pagamento. Idempotente.

-- 1) Enums (cria só se não existirem)
DO $$ BEGIN
  CREATE TYPE "StatusEntregaPedido" AS ENUM ('PENDENTE', 'PARCIAL', 'ENTREGUE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "StatusFinanceiroPedido" AS ENUM ('NAO_FATURADO', 'A_RECEBER', 'PARCIAL', 'RECEBIDO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Colunas
ALTER TABLE "PedidoVenda" ADD COLUMN IF NOT EXISTS "statusEntrega" "StatusEntregaPedido" NOT NULL DEFAULT 'PENDENTE';
ALTER TABLE "PedidoVenda" ADD COLUMN IF NOT EXISTS "statusFinanceiro" "StatusFinanceiroPedido" NOT NULL DEFAULT 'NAO_FATURADO';
ALTER TABLE "PedidoVenda" ADD COLUMN IF NOT EXISTS "condicaoPagamentoId" TEXT;

-- 3) FK p/ a condição de pagamento (cria só se não existir)
DO $$ BEGIN
  ALTER TABLE "PedidoVenda"
    ADD CONSTRAINT "PedidoVenda_condicaoPagamentoId_fkey"
    FOREIGN KEY ("condicaoPagamentoId") REFERENCES "CondicaoPagamento"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Backfill condicaoPagamentoId pelo nome (quando casar)
UPDATE "PedidoVenda" pv
SET "condicaoPagamentoId" = cp.id
FROM "CondicaoPagamento" cp
WHERE pv."condicaoPagamentoId" IS NULL
  AND pv."condicaoPagamento" IS NOT NULL
  AND lower(btrim(pv."condicaoPagamento")) = lower(btrim(cp.nome));

-- 5) Backfill statusEntrega: ENTREGUE se tudo entregue, PARCIAL se algo, senão PENDENTE.
WITH ent AS (
  SELECT pvi."pedidoVendaId" AS pid,
         pvi.id AS itemid,
         pvi.quantidade::numeric AS pedida,
         COALESCE((
           SELECT sum(mi.quantidade)::numeric
           FROM "MinutaItem" mi JOIN "Minuta" m ON m.id = mi."minutaId"
           WHERE mi."pedidoVendaItemId" = pvi.id AND m.status = 'ENTREGUE'
         ), 0) AS entregue
  FROM "PedidoVendaItem" pvi
), agg AS (
  SELECT pid,
         bool_and(entregue >= pedida) AS todos,
         bool_or(entregue > 0) AS algum
  FROM ent GROUP BY pid
)
UPDATE "PedidoVenda" pv
SET "statusEntrega" = CASE
    WHEN a.todos THEN 'ENTREGUE'::"StatusEntregaPedido"
    WHEN a.algum THEN 'PARCIAL'::"StatusEntregaPedido"
    ELSE 'PENDENTE'::"StatusEntregaPedido" END
FROM agg a
WHERE a.pid = pv.id;

-- 6) Backfill statusFinanceiro a partir das contas a receber (ignora canceladas).
WITH cr AS (
  SELECT "pedidoVendaId" AS pid,
         count(*) AS titulos,
         sum("valorOriginal")::numeric AS total,
         sum("valorPago")::numeric AS pago
  FROM "ContaReceber"
  WHERE "pedidoVendaId" IS NOT NULL AND status <> 'CANCELADA'
  GROUP BY "pedidoVendaId"
)
UPDATE "PedidoVenda" pv
SET "statusFinanceiro" = CASE
    WHEN cr.titulos = 0 THEN 'NAO_FATURADO'::"StatusFinanceiroPedido"
    WHEN cr.pago >= cr.total AND cr.total > 0 THEN 'RECEBIDO'::"StatusFinanceiroPedido"
    WHEN cr.pago > 0 THEN 'PARCIAL'::"StatusFinanceiroPedido"
    ELSE 'A_RECEBER'::"StatusFinanceiroPedido" END
FROM cr
WHERE cr.pid = pv.id;
