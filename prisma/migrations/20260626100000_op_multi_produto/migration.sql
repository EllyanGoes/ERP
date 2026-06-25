-- OP multi-produto: cabeçalho ganha prazos início/fim + responsável; nova tabela de
-- produtos da OP (linhas). Idempotente.

ALTER TABLE "OrdemProducao" ADD COLUMN IF NOT EXISTS "dataPrevistaInicio" TIMESTAMP(3);
ALTER TABLE "OrdemProducao" ADD COLUMN IF NOT EXISTS "dataPrevistaFim" TIMESTAMP(3);
ALTER TABLE "OrdemProducao" ADD COLUMN IF NOT EXISTS "responsavelColaboradorId" TEXT;

CREATE TABLE IF NOT EXISTS "OrdemProducaoProdutoItem" (
    "id" TEXT NOT NULL,
    "ordemProducaoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidadePlanejada" DECIMAL(15,3) NOT NULL,
    "unidadeId" TEXT,
    "quantidadeReal" DECIMAL(15,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrdemProducaoProdutoItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrdemProducaoProdutoItem_ordemProducaoId_idx" ON "OrdemProducaoProdutoItem"("ordemProducaoId");

DO $$ BEGIN
  ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_responsavelColaboradorId_fkey"
    FOREIGN KEY ("responsavelColaboradorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "OrdemProducaoProdutoItem" ADD CONSTRAINT "OrdemProducaoProdutoItem_ordemProducaoId_fkey"
    FOREIGN KEY ("ordemProducaoId") REFERENCES "OrdemProducao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "OrdemProducaoProdutoItem" ADD CONSTRAINT "OrdemProducaoProdutoItem_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "OrdemProducaoProdutoItem" ADD CONSTRAINT "OrdemProducaoProdutoItem_unidadeId_fkey"
    FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
