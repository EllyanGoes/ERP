-- Módulo unificado de entradas/saídas:
-- 1) NaturezaFinanceira ganha a CONTRAPARTIDA patrimonial (ativo a receber p/
--    ENTRADA, passivo a pagar p/ SAIDA) — a conta de resultado já vem do vínculo
--    ContaContabil.naturezaFinanceiraId.
-- 2) ContaPagar/ContaReceber ganham beneficiário polimórfico (fornecedor/
--    colaborador/cliente/sem-vínculo). Não interfere na contabilização.
-- 3) ContaReceber.clienteId passa a NULLABLE (receita sem vínculo cadastral).
-- Idempotente. Não remove colunas.

ALTER TABLE "NaturezaFinanceira" ADD COLUMN IF NOT EXISTS "contaContrapartidaId" text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NaturezaFinanceira_contaContrapartidaId_fkey') THEN
    ALTER TABLE "NaturezaFinanceira"
      ADD CONSTRAINT "NaturezaFinanceira_contaContrapartidaId_fkey"
      FOREIGN KEY ("contaContrapartidaId") REFERENCES "ContaContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "ContaPagar"   ADD COLUMN IF NOT EXISTS "beneficiarioTipo" text;
ALTER TABLE "ContaPagar"   ADD COLUMN IF NOT EXISTS "beneficiarioId"   text;
ALTER TABLE "ContaReceber" ADD COLUMN IF NOT EXISTS "beneficiarioTipo" text;
ALTER TABLE "ContaReceber" ADD COLUMN IF NOT EXISTS "beneficiarioId"   text;

ALTER TABLE "ContaReceber" ALTER COLUMN "clienteId" DROP NOT NULL;
