-- Encontro de Contas (AP-AR netting): compensa títulos a receber x a pagar do
-- mesmo parceiro (mesmo CNPJ) sem caixa, via conta bancária transitória.

-- Flags nos modelos existentes
ALTER TABLE "ContaBancaria" ADD COLUMN IF NOT EXISTS "compensacao" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ContaReceber" ADD COLUMN IF NOT EXISTS "compensacaoOrigemId" TEXT;
ALTER TABLE "ContaPagar" ADD COLUMN IF NOT EXISTS "compensacaoOrigemId" TEXT;

-- Compensação (cabeçalho)
CREATE TABLE IF NOT EXISTS "Compensacao" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "numero" TEXT NOT NULL,
  "cpfCnpj" TEXT NOT NULL,
  "clienteId" TEXT,
  "fornecedorId" TEXT,
  "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valorCompensado" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "modoResiduo" TEXT NOT NULL DEFAULT 'PARCIAL',
  "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
  "contaBancariaCompensacaoId" TEXT,
  "observacoes" TEXT,
  "criadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Compensacao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Compensacao_empresaId_numero_key" ON "Compensacao"("empresaId", "numero");
CREATE INDEX IF NOT EXISTS "Compensacao_empresaId_idx" ON "Compensacao"("empresaId");
CREATE INDEX IF NOT EXISTS "Compensacao_cpfCnpj_idx" ON "Compensacao"("cpfCnpj");
CREATE INDEX IF NOT EXISTS "Compensacao_status_idx" ON "Compensacao"("status");

-- Itens (títulos alocados)
CREATE TABLE IF NOT EXISTS "CompensacaoItem" (
  "id" TEXT NOT NULL,
  "compensacaoId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "contaReceberId" TEXT,
  "contaPagarId" TEXT,
  "valorAplicado" DECIMAL(15,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompensacaoItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CompensacaoItem_compensacaoId_idx" ON "CompensacaoItem"("compensacaoId");
CREATE INDEX IF NOT EXISTS "CompensacaoItem_contaReceberId_idx" ON "CompensacaoItem"("contaReceberId");
CREATE INDEX IF NOT EXISTS "CompensacaoItem_contaPagarId_idx" ON "CompensacaoItem"("contaPagarId");

CREATE INDEX IF NOT EXISTS "ContaReceber_compensacaoOrigemId_idx" ON "ContaReceber"("compensacaoOrigemId");
CREATE INDEX IF NOT EXISTS "ContaPagar_compensacaoOrigemId_idx" ON "ContaPagar"("compensacaoOrigemId");

-- FKs
DO $$ BEGIN
  ALTER TABLE "Compensacao" ADD CONSTRAINT "Compensacao_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Compensacao" ADD CONSTRAINT "Compensacao_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Compensacao" ADD CONSTRAINT "Compensacao_fornecedorId_fkey"
    FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Compensacao" ADD CONSTRAINT "Compensacao_contaBancariaCompensacaoId_fkey"
    FOREIGN KEY ("contaBancariaCompensacaoId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CompensacaoItem" ADD CONSTRAINT "CompensacaoItem_compensacaoId_fkey"
    FOREIGN KEY ("compensacaoId") REFERENCES "Compensacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CompensacaoItem" ADD CONSTRAINT "CompensacaoItem_contaReceberId_fkey"
    FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CompensacaoItem" ADD CONSTRAINT "CompensacaoItem_contaPagarId_fkey"
    FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_compensacaoOrigemId_fkey"
    FOREIGN KEY ("compensacaoOrigemId") REFERENCES "Compensacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_compensacaoOrigemId_fkey"
    FOREIGN KEY ("compensacaoOrigemId") REFERENCES "Compensacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Vínculo do item ao LancamentoFinanceiro da baixa (estorno preciso).
ALTER TABLE "CompensacaoItem" ADD COLUMN IF NOT EXISTS "lancamentoFinanceiroId" TEXT;
CREATE INDEX IF NOT EXISTS "CompensacaoItem_lancamentoFinanceiroId_idx" ON "CompensacaoItem"("lancamentoFinanceiroId");
DO $$ BEGIN
  ALTER TABLE "CompensacaoItem" ADD CONSTRAINT "CompensacaoItem_lancamentoFinanceiroId_fkey"
    FOREIGN KEY ("lancamentoFinanceiroId") REFERENCES "LancamentoCaixa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
