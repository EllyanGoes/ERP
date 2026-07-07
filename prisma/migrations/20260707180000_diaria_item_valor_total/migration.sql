-- Valor total do item de diária (diária base + horas excedentes × valor-hora).
-- Migration idempotente (padrão do projeto — nunca db push em prod).
ALTER TABLE "DiariaItem" ADD COLUMN IF NOT EXISTS "valorTotal" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- Backfill: itens antigos não tinham excedente valorado — total = diária.
UPDATE "DiariaItem" SET "valorTotal" = "valor" WHERE "valorTotal" = 0 AND "valor" <> 0;
