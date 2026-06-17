-- Aposenta o plano de contas gerencial (CategoriaFinanceira): a classificação
-- gerencial passa a ser só Natureza Financeira. CategoriaFinanceira está vazia,
-- então a remoção é segura. Idempotente.

-- ── Natureza nos lançamentos e recorrências (CR/CP já têm) ─────────────────────
ALTER TABLE "LancamentoCaixa" ADD COLUMN IF NOT EXISTS "naturezaFinanceiraId" TEXT;
ALTER TABLE "Recorrencia"     ADD COLUMN IF NOT EXISTS "naturezaFinanceiraId" TEXT;
CREATE INDEX IF NOT EXISTS "LancamentoCaixa_naturezaFinanceiraId_idx" ON "LancamentoCaixa"("naturezaFinanceiraId");

-- ── Remove o vínculo antigo com CategoriaFinanceira ───────────────────────────
-- DROP COLUMN remove junto a FK e o índice dependentes.
DROP INDEX IF EXISTS "LancamentoCaixa_categoriaFinanceiraId_idx";
ALTER TABLE "ContaPagar"      DROP COLUMN IF EXISTS "categoriaFinanceiraId";
ALTER TABLE "ContaReceber"    DROP COLUMN IF EXISTS "categoriaFinanceiraId";
ALTER TABLE "LancamentoCaixa" DROP COLUMN IF EXISTS "categoriaFinanceiraId";
ALTER TABLE "Recorrencia"     DROP COLUMN IF EXISTS "categoriaFinanceiraId";

-- ── Remove a tabela e o enum ──────────────────────────────────────────────────
DROP TABLE IF EXISTS "CategoriaFinanceira";
DROP TYPE IF EXISTS "TipoCategoriaFinanceira";
