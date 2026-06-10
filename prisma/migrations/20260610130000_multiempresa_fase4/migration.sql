-- ═══════════════════════════════════════════════════════════════════════════
-- MULTIEMPRESA — FASE 4: operação espelhada entre empresas do grupo
--
-- 1. Flags `intragrupo` em PedidoVenda/PedidoCompra/ContaReceber/ContaPagar e
--    vínculos de espelho (PedidoCompra.pedidoVendaEspelhoId,
--    ContaPagar.contaReceberEspelhoId) — usados também na Fase 5 para eliminar
--    a dupla contagem no consolidado.
-- 2. Cada Empresa do grupo ganha (e é vinculada a) um Cliente e um Fornecedor
--    no cadastro compartilhado — é assim que uma venda "para a Atalaia" é
--    reconhecida como intragrupo. Se já existir cadastro com o mesmo CNPJ,
--    reaproveita em vez de duplicar.
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "ContaPagar" ADD COLUMN IF NOT EXISTS "contaReceberEspelhoId" TEXT,
ADD COLUMN IF NOT EXISTS "intragrupo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ContaReceber" ADD COLUMN IF NOT EXISTS "intragrupo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PedidoCompra" ADD COLUMN IF NOT EXISTS "intragrupo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "pedidoVendaEspelhoId" TEXT;

-- AlterTable
ALTER TABLE "PedidoVenda" ADD COLUMN IF NOT EXISTS "intragrupo" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ContaPagar_contaReceberEspelhoId_key" ON "ContaPagar"("contaReceberEspelhoId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PedidoCompra_pedidoVendaEspelhoId_key" ON "PedidoCompra"("pedidoVendaEspelhoId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_contaReceberEspelhoId_fkey" FOREIGN KEY ("contaReceberEspelhoId") REFERENCES "ContaReceber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_pedidoVendaEspelhoId_fkey" FOREIGN KEY ("pedidoVendaEspelhoId") REFERENCES "PedidoVenda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Backfill: Cliente e Fornecedor de cada empresa do grupo (cadastro compartilhado)
DO $$
DECLARE e RECORD; v_id TEXT;
BEGIN
  FOR e IN SELECT * FROM "Empresa" LOOP
    IF e."clienteId" IS NULL THEN
      SELECT id INTO v_id FROM "Cliente" WHERE "cpfCnpj" = e.cnpj LIMIT 1;
      IF v_id IS NULL THEN
        v_id := 'cli_' || e.id;
        INSERT INTO "Cliente" (id, "tipoPessoa", "razaoSocial", "nomeFantasia", "cpfCnpj", status, observacoes, "createdAt", "updatedAt")
        VALUES (v_id, 'JURIDICA', e."razaoSocial", e."nomeFantasia", e.cnpj, 'ATIVO', 'Empresa do grupo (intragrupo)', now(), now())
        ON CONFLICT (id) DO NOTHING;
      END IF;
      UPDATE "Empresa" SET "clienteId" = v_id WHERE id = e.id;
    END IF;

    IF e."fornecedorId" IS NULL THEN
      SELECT id INTO v_id FROM "Fornecedor" WHERE "cpfCnpj" = e.cnpj LIMIT 1;
      IF v_id IS NULL THEN
        v_id := 'forn_' || e.id;
        INSERT INTO "Fornecedor" (id, "tipoPessoa", "razaoSocial", "nomeFantasia", "cpfCnpj", ativo, observacoes, "createdAt", "updatedAt")
        VALUES (v_id, 'JURIDICA', e."razaoSocial", e."nomeFantasia", e.cnpj, true, 'Empresa do grupo (intragrupo)', now(), now())
        ON CONFLICT (id) DO NOTHING;
      END IF;
      UPDATE "Empresa" SET "fornecedorId" = v_id WHERE id = e.id;
    END IF;
  END LOOP;
END $$;
