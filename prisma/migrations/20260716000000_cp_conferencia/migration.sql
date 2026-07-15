-- Vínculo direto ContaPagar → ConferenciaCompra (Documento de Entrada que
-- originou o título, por pedido ou avulsa). Dá ao financeiro o link clicável
-- para o DE e o TES/centro de custo de origem lidos dos itens do DE.
-- Backfill: (1) CPs de pedido via ConferenciaCompra.pedidoId; (2) CPs de
-- entrada avulsa pelo padrão de descrição "Compra DE-XXXX (entrada avulsa)".
-- Idempotente.

ALTER TABLE "ContaPagar" ADD COLUMN IF NOT EXISTS "conferenciaId" TEXT;

DO $$ BEGIN
  ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_conferenciaId_fkey"
    FOREIGN KEY ("conferenciaId") REFERENCES "ConferenciaCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "ContaPagar_conferenciaId_idx" ON "ContaPagar"("conferenciaId");

-- (1) Título de compra por pedido: o DE do pedido (pedidoId é @unique no DE).
UPDATE "ContaPagar" cp
SET "conferenciaId" = c.id
FROM "ConferenciaCompra" c
WHERE cp."conferenciaId" IS NULL
  AND cp."pedidoCompraId" IS NOT NULL
  AND c."pedidoId" = cp."pedidoCompraId";

-- (2) Título de entrada avulsa: casa pela descrição gerada na conclusão do DE
-- ("Compra DE-XXXX (entrada avulsa)"), na mesma empresa.
UPDATE "ContaPagar" cp
SET "conferenciaId" = c.id
FROM "ConferenciaCompra" c
WHERE cp."conferenciaId" IS NULL
  AND cp."pedidoCompraId" IS NULL
  AND c."empresaId" = cp."empresaId"
  AND c."pedidoId" IS NULL
  AND cp.descricao LIKE 'Compra ' || c.numero || ' (entrada avulsa)%';
