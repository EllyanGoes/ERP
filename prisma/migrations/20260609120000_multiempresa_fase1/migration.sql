-- ═══════════════════════════════════════════════════════════════════════════
-- MULTIEMPRESA — FASE 1: fundação + carimbo dos dados existentes
--
-- 1. Empresa vira o tenant do grupo (slug, ativo, vínculo cliente/fornecedor).
-- 2. A linha existente da Empresa (Tramontin) tem o id normalizado para o id
--    fixo 'emp_tramontin' (nenhuma FK apontava para Empresa antes desta
--    migration, então trocar o id é seguro). Se a tabela estiver vazia, insere.
-- 3. 26 tabelas operacionais ganham empresaId NOT NULL DEFAULT 'emp_tramontin'
--    — o DEFAULT faz o backfill dos registros existentes (todos = Tramontin) e
--    garante que o código atual continue gravando como Tramontin até a Fase 2.
-- 4. Uniques de numero viram compostas (empresaId, numero); Sequencia passa a
--    ter PK composta (empresaId, prefixo); EstoqueItem ganha empresaId na unique.
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
-- ═══════════════════════════════════════════════════════════════════════════

-- DropIndex
DROP INDEX IF EXISTS "ConferenciaCompra_numero_key";

-- DropIndex
DROP INDEX IF EXISTS "ContaPagar_numero_key";

-- DropIndex
DROP INDEX IF EXISTS "ContaReceber_numero_key";

-- DropIndex
DROP INDEX IF EXISTS "CotacaoCompra_numero_key";

-- DropIndex
DROP INDEX IF EXISTS "EstoqueItem_itemId_localEstoqueId_key";

-- DropIndex
DROP INDEX IF EXISTS "InventarioMaterial_numero_key";

-- DropIndex
DROP INDEX IF EXISTS "LoteMovimentacao_numero_key";

-- DropIndex
DROP INDEX IF EXISTS "Minuta_numero_key";

-- DropIndex
DROP INDEX IF EXISTS "NecessidadeCompra_numero_key";

-- DropIndex
DROP INDEX IF EXISTS "OrdemProducao_numero_key";

-- DropIndex
DROP INDEX IF EXISTS "PedidoCompra_numero_key";

-- DropIndex
DROP INDEX IF EXISTS "PedidoVenda_numero_key";

-- DropIndex
DROP INDEX IF EXISTS "RequisicaoMaterial_numero_key";

-- AlterTable
ALTER TABLE "ConferenciaCompra" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "ConferenciaCompraItem" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "ConsumoBiomassa" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "ContaBancaria" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "ContaPagar" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "ContaReceber" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "CotacaoCompra" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "clienteId" TEXT,
ADD COLUMN IF NOT EXISTS "fornecedorId" TEXT,
ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- Backfill: normaliza/insere a empresa Tramontin com id fixo
DO $$
DECLARE v_id TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Empresa" WHERE id = 'emp_tramontin') THEN
    SELECT id INTO v_id FROM "Empresa" ORDER BY "createdAt" ASC LIMIT 1;
    IF v_id IS NULL THEN
      INSERT INTO "Empresa" (id, "razaoSocial", "nomeFantasia", cnpj, slug, ativo, "createdAt", "updatedAt")
      VALUES ('emp_tramontin', 'Tramontin', 'Tramontin', 'TRAMONTIN-AJUSTAR-CNPJ', 'tramontin', true, now(), now());
    ELSE
      UPDATE "Empresa" SET id = 'emp_tramontin' WHERE id = v_id;
    END IF;
  END IF;
  UPDATE "Empresa" SET slug = 'tramontin' WHERE id = 'emp_tramontin' AND slug IS NULL;
END $$;

-- AlterTable
ALTER TABLE "EstoqueItem" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "ImportacaoOFX" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "InventarioMaterial" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "ItemOrdemProducao" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "LancamentoCaixa" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "LocalEstoque" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "LoteMovimentacao" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "Minuta" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "MinutaItem" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "MovimentacaoComodato" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "MovimentacaoEstoque" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "NecessidadeCompra" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "OrdemProducao" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "PedidoCompra" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "PedidoVenda" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "PedidoVendaItem" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "PlanoMestre" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "Recorrencia" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable
ALTER TABLE "RequisicaoMaterial" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

-- AlterTable: Sequencia passa a ter PK composta (empresaId, prefixo)
ALTER TABLE "Sequencia" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.key_column_usage
    WHERE table_name = 'Sequencia' AND constraint_name = 'Sequencia_pkey' AND column_name = 'empresaId'
  ) THEN
    ALTER TABLE "Sequencia" DROP CONSTRAINT IF EXISTS "Sequencia_pkey";
    ALTER TABLE "Sequencia" ADD CONSTRAINT "Sequencia_pkey" PRIMARY KEY ("empresaId", "prefixo");
  END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConferenciaCompra_empresaId_idx" ON "ConferenciaCompra"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ConferenciaCompra_empresaId_numero_key" ON "ConferenciaCompra"("empresaId", "numero");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConferenciaCompraItem_empresaId_idx" ON "ConferenciaCompraItem"("empresaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConsumoBiomassa_empresaId_idx" ON "ConsumoBiomassa"("empresaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContaBancaria_empresaId_idx" ON "ContaBancaria"("empresaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContaPagar_empresaId_idx" ON "ContaPagar"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ContaPagar_empresaId_numero_key" ON "ContaPagar"("empresaId", "numero");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContaReceber_empresaId_idx" ON "ContaReceber"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ContaReceber_empresaId_numero_key" ON "ContaReceber"("empresaId", "numero");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CotacaoCompra_empresaId_idx" ON "CotacaoCompra"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CotacaoCompra_empresaId_numero_key" ON "CotacaoCompra"("empresaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Empresa_slug_key" ON "Empresa"("slug");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Empresa_clienteId_key" ON "Empresa"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Empresa_fornecedorId_key" ON "Empresa"("fornecedorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EstoqueItem_empresaId_idx" ON "EstoqueItem"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EstoqueItem_empresaId_itemId_localEstoqueId_key" ON "EstoqueItem"("empresaId", "itemId", "localEstoqueId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ImportacaoOFX_empresaId_idx" ON "ImportacaoOFX"("empresaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventarioMaterial_empresaId_idx" ON "InventarioMaterial"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InventarioMaterial_empresaId_numero_key" ON "InventarioMaterial"("empresaId", "numero");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ItemOrdemProducao_empresaId_idx" ON "ItemOrdemProducao"("empresaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LancamentoCaixa_empresaId_idx" ON "LancamentoCaixa"("empresaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LocalEstoque_empresaId_idx" ON "LocalEstoque"("empresaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoteMovimentacao_empresaId_idx" ON "LoteMovimentacao"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LoteMovimentacao_empresaId_numero_key" ON "LoteMovimentacao"("empresaId", "numero");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Minuta_empresaId_idx" ON "Minuta"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Minuta_empresaId_numero_key" ON "Minuta"("empresaId", "numero");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MinutaItem_empresaId_idx" ON "MinutaItem"("empresaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MovimentacaoComodato_empresaId_idx" ON "MovimentacaoComodato"("empresaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MovimentacaoEstoque_empresaId_idx" ON "MovimentacaoEstoque"("empresaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NecessidadeCompra_empresaId_idx" ON "NecessidadeCompra"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NecessidadeCompra_empresaId_numero_key" ON "NecessidadeCompra"("empresaId", "numero");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrdemProducao_empresaId_idx" ON "OrdemProducao"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OrdemProducao_empresaId_numero_key" ON "OrdemProducao"("empresaId", "numero");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PedidoCompra_empresaId_idx" ON "PedidoCompra"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PedidoCompra_empresaId_numero_key" ON "PedidoCompra"("empresaId", "numero");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PedidoVenda_empresaId_idx" ON "PedidoVenda"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PedidoVenda_empresaId_numero_key" ON "PedidoVenda"("empresaId", "numero");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PedidoVendaItem_empresaId_idx" ON "PedidoVendaItem"("empresaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlanoMestre_empresaId_idx" ON "PlanoMestre"("empresaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Recorrencia_empresaId_idx" ON "Recorrencia"("empresaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RequisicaoMaterial_empresaId_idx" ON "RequisicaoMaterial"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RequisicaoMaterial_empresaId_numero_key" ON "RequisicaoMaterial"("empresaId", "numero");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ConferenciaCompra" ADD CONSTRAINT "ConferenciaCompra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ConferenciaCompraItem" ADD CONSTRAINT "ConferenciaCompraItem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ContaBancaria" ADD CONSTRAINT "ContaBancaria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Recorrencia" ADD CONSTRAINT "Recorrencia_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CotacaoCompra" ADD CONSTRAINT "CotacaoCompra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Empresa" ADD CONSTRAINT "Empresa_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Empresa" ADD CONSTRAINT "Empresa_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "EstoqueItem" ADD CONSTRAINT "EstoqueItem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LancamentoCaixa" ADD CONSTRAINT "LancamentoCaixa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ImportacaoOFX" ADD CONSTRAINT "ImportacaoOFX_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LocalEstoque" ADD CONSTRAINT "LocalEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LoteMovimentacao" ADD CONSTRAINT "LoteMovimentacao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MovimentacaoComodato" ADD CONSTRAINT "MovimentacaoComodato_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "NecessidadeCompra" ADD CONSTRAINT "NecessidadeCompra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PedidoVendaItem" ADD CONSTRAINT "PedidoVendaItem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Minuta" ADD CONSTRAINT "Minuta_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MinutaItem" ADD CONSTRAINT "MinutaItem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Sequencia" ADD CONSTRAINT "Sequencia_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ItemOrdemProducao" ADD CONSTRAINT "ItemOrdemProducao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ConsumoBiomassa" ADD CONSTRAINT "ConsumoBiomassa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PlanoMestre" ADD CONSTRAINT "PlanoMestre_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "RequisicaoMaterial" ADD CONSTRAINT "RequisicaoMaterial_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "InventarioMaterial" ADD CONSTRAINT "InventarioMaterial_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

