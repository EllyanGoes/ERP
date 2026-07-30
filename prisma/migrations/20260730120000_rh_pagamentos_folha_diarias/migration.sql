-- Pagamentos de RH (folha e diárias) pelo módulo de origem:
--  • FolhaItem/DiariaItem: carimbo do pagamento individual (data, conta, valor);
--  • ContaPagar: diariaFolhaId (título único da diária) e contabilizacaoExterna
--    (todo o contábil — provisão E baixa — é postado pelo módulo de RH, por
--    colaborador; contabilizarTituloPagar pula o título);
--  • OrigemLancamento: DIARIA.
-- Idempotente (padrão do projeto): IF NOT EXISTS + FKs/enum guardados.

ALTER TABLE "FolhaItem" ADD COLUMN IF NOT EXISTS "dataPagamento" TIMESTAMP(3);
ALTER TABLE "FolhaItem" ADD COLUMN IF NOT EXISTS "contaBancariaId" TEXT;
ALTER TABLE "FolhaItem" ADD COLUMN IF NOT EXISTS "valorPago" DECIMAL(15,2);

ALTER TABLE "DiariaItem" ADD COLUMN IF NOT EXISTS "dataPagamento" TIMESTAMP(3);
ALTER TABLE "DiariaItem" ADD COLUMN IF NOT EXISTS "contaBancariaId" TEXT;
ALTER TABLE "DiariaItem" ADD COLUMN IF NOT EXISTS "valorPago" DECIMAL(15,2);

ALTER TABLE "ContaPagar" ADD COLUMN IF NOT EXISTS "diariaFolhaId" TEXT;
ALTER TABLE "ContaPagar" ADD COLUMN IF NOT EXISTS "contabilizacaoExterna" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_diariaFolhaId_fkey"
    FOREIGN KEY ("diariaFolhaId") REFERENCES "DiariaFolha"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TYPE "OrigemLancamento" ADD VALUE IF NOT EXISTS 'DIARIA';
