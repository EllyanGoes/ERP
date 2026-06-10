-- ═══════════════════════════════════════════════════════════════════════════
-- ESTOQUE DE TERCEIROS SOB GUARDA: dimensão de dono no estoque físico
--
-- clienteDonoId NULL = estoque próprio (estado de todos os dados existentes —
-- por isso não há backfill); preenchido = mercadoria de um cliente armazenada
-- no depósito da empresa. A unique do EstoqueItem ganha o dono: o mesmo item
-- no mesmo local pode ter uma linha própria e uma por cliente dono.
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "EstoqueItem" ADD COLUMN IF NOT EXISTS "clienteDonoId" TEXT;

-- AlterTable
ALTER TABLE "MovimentacaoEstoque" ADD COLUMN IF NOT EXISTS "clienteDonoId" TEXT;

-- DropIndex (unique antiga, sem a dimensão de dono)
DROP INDEX IF EXISTS "EstoqueItem_empresaId_itemId_localEstoqueId_key";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EstoqueItem_empresaId_itemId_localEstoqueId_clienteDonoId_key" ON "EstoqueItem"("empresaId", "itemId", "localEstoqueId", "clienteDonoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EstoqueItem_clienteDonoId_idx" ON "EstoqueItem"("clienteDonoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MovimentacaoEstoque_clienteDonoId_idx" ON "MovimentacaoEstoque"("clienteDonoId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "EstoqueItem" ADD CONSTRAINT "EstoqueItem_clienteDonoId_fkey" FOREIGN KEY ("clienteDonoId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_clienteDonoId_fkey" FOREIGN KEY ("clienteDonoId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
