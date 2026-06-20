-- Data de NEGÓCIO da movimentação de estoque (date-only, UTC midnight),
-- independente do createdAt (auditoria). Ex.: a dt. de emissão do documento de
-- entrada. Backfill: dia-calendário de São Paulo do createdAt, à meia-noite UTC
-- (mesmo padrão de dtEmissao/formatDate em UTC). Idempotente.

ALTER TABLE "MovimentacaoEstoque" ADD COLUMN IF NOT EXISTS "data" TIMESTAMP(3);

UPDATE "MovimentacaoEstoque"
SET "data" = ((("createdAt" AT TIME ZONE 'America/Sao_Paulo')::date)::timestamp AT TIME ZONE 'UTC')
WHERE "data" IS NULL;

CREATE INDEX IF NOT EXISTS "MovimentacaoEstoque_data_idx" ON "MovimentacaoEstoque"("data");
