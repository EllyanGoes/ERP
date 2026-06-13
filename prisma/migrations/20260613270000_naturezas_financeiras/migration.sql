-- Naturezas financeiras (estrutura de fluxo de caixa/DRE), separada do plano de
-- contas. Enums + tabelas + vínculo nos títulos/pedidos + seed por empresa.
-- Idempotente.

DO $$ BEGIN
  CREATE TYPE "NaturezaTipo" AS ENUM ('ENTRADA', 'SAIDA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NaturezaGrupo" AS ENUM ('RECEITA_OPERACIONAL', 'CUSTO_OPERACIONAL', 'DESPESA_OPERACIONAL', 'INVESTIMENTO', 'FINANCIAMENTO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "NaturezaSubgrupo" (
  "id" TEXT PRIMARY KEY,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "nome" TEXT NOT NULL,
  "grupo" "NaturezaGrupo" NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "NaturezaSubgrupo_empresaId_idx" ON "NaturezaSubgrupo"("empresaId");

CREATE TABLE IF NOT EXISTS "NaturezaFinanceira" (
  "id" TEXT PRIMARY KEY,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "nome" TEXT NOT NULL,
  "tipo" "NaturezaTipo" NOT NULL,
  "grupo" "NaturezaGrupo" NOT NULL,
  "subgrupoId" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "NaturezaFinanceira_empresaId_idx" ON "NaturezaFinanceira"("empresaId");
CREATE INDEX IF NOT EXISTS "NaturezaFinanceira_tipo_idx" ON "NaturezaFinanceira"("tipo");
CREATE INDEX IF NOT EXISTS "NaturezaFinanceira_subgrupoId_idx" ON "NaturezaFinanceira"("subgrupoId");

-- Vínculo nos títulos e nos documentos de origem.
ALTER TABLE "ContaReceber"      ADD COLUMN IF NOT EXISTS "naturezaFinanceiraId" TEXT;
ALTER TABLE "ContaPagar"        ADD COLUMN IF NOT EXISTS "naturezaFinanceiraId" TEXT;
ALTER TABLE "PedidoVenda"       ADD COLUMN IF NOT EXISTS "naturezaFinanceiraId" TEXT;
ALTER TABLE "ConferenciaCompra" ADD COLUMN IF NOT EXISTS "naturezaFinanceiraId" TEXT;

DO $$ BEGIN
  ALTER TABLE "NaturezaFinanceira" ADD CONSTRAINT "NaturezaFinanceira_subgrupoId_fkey"
    FOREIGN KEY ("subgrupoId") REFERENCES "NaturezaSubgrupo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "NaturezaSubgrupo" ADD CONSTRAINT "NaturezaSubgrupo_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "NaturezaFinanceira" ADD CONSTRAINT "NaturezaFinanceira_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_naturezaFinanceiraId_fkey"
    FOREIGN KEY ("naturezaFinanceiraId") REFERENCES "NaturezaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_naturezaFinanceiraId_fkey"
    FOREIGN KEY ("naturezaFinanceiraId") REFERENCES "NaturezaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_naturezaFinanceiraId_fkey"
    FOREIGN KEY ("naturezaFinanceiraId") REFERENCES "NaturezaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ConferenciaCompra" ADD CONSTRAINT "ConferenciaCompra_naturezaFinanceiraId_fkey"
    FOREIGN KEY ("naturezaFinanceiraId") REFERENCES "NaturezaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Seed por empresa ativa (subgrupos + naturezas padrão) ───────────────────
INSERT INTO "NaturezaSubgrupo" (id, "empresaId", nome, grupo, ativo, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e.id, s.nome, s.grupo::"NaturezaGrupo", true, now(), now()
FROM "Empresa" e
CROSS JOIN (VALUES
  ('Vendas','RECEITA_OPERACIONAL'),
  ('Custo das mercadorias','CUSTO_OPERACIONAL'),
  ('Despesas administrativas','DESPESA_OPERACIONAL'),
  ('Despesas com pessoal','DESPESA_OPERACIONAL')
) AS s(nome, grupo)
WHERE e.ativo = true
  AND NOT EXISTS (SELECT 1 FROM "NaturezaSubgrupo" x WHERE x."empresaId"=e.id AND x.nome=s.nome);

INSERT INTO "NaturezaFinanceira" (id, "empresaId", nome, tipo, grupo, "subgrupoId", ativo, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e.id, n.nome, n.tipo::"NaturezaTipo", n.grupo::"NaturezaGrupo",
  (SELECT sg.id FROM "NaturezaSubgrupo" sg WHERE sg."empresaId"=e.id AND sg.nome=n.subnome LIMIT 1),
  true, now(), now()
FROM "Empresa" e
CROSS JOIN (VALUES
  ('Venda de mercadorias','ENTRADA','RECEITA_OPERACIONAL','Vendas'),
  ('Venda de serviços','ENTRADA','RECEITA_OPERACIONAL','Vendas'),
  ('Compra de mercadorias','SAIDA','CUSTO_OPERACIONAL','Custo das mercadorias'),
  ('Frete sobre compras','SAIDA','CUSTO_OPERACIONAL','Custo das mercadorias'),
  ('Insumos / matéria-prima','SAIDA','CUSTO_OPERACIONAL','Custo das mercadorias'),
  ('Salários e encargos','SAIDA','DESPESA_OPERACIONAL','Despesas com pessoal'),
  ('Impostos e taxas','SAIDA','DESPESA_OPERACIONAL','Despesas administrativas'),
  ('Energia, água e telefone','SAIDA','DESPESA_OPERACIONAL','Despesas administrativas'),
  ('Aluguel','SAIDA','DESPESA_OPERACIONAL','Despesas administrativas'),
  ('Compra de imobilizado','SAIDA','INVESTIMENTO',NULL),
  ('Captação de empréstimos','ENTRADA','FINANCIAMENTO',NULL),
  ('Pagamento de empréstimos','SAIDA','FINANCIAMENTO',NULL)
) AS n(nome, tipo, grupo, subnome)
WHERE e.ativo = true
  AND NOT EXISTS (SELECT 1 FROM "NaturezaFinanceira" x WHERE x."empresaId"=e.id AND x.nome=n.nome AND x.tipo=n.tipo::"NaturezaTipo");
