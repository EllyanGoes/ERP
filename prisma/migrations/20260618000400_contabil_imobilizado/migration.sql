-- Imobilizado (ativo não circulante) + depreciação. Cria os enums e tabelas,
-- e semeia o grupo 1.2 (Ativo Não Circulante) no plano de contas de cada empresa
-- mais a conta de despesa de depreciação (3.3.9003). Idempotente.

-- ── Enums ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "MetodoDepreciacao" AS ENUM ('LINEAR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "StatusImobilizado" AS ENUM ('ATIVO', 'BAIXADO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Tabelas ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Imobilizado" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "descricao" TEXT NOT NULL,
  "dataAquisicao" TIMESTAMP(3) NOT NULL,
  "valorAquisicao" DECIMAL(15,2) NOT NULL,
  "valorResidual" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "vidaUtilMeses" INTEGER NOT NULL,
  "metodo" "MetodoDepreciacao" NOT NULL DEFAULT 'LINEAR',
  "status" "StatusImobilizado" NOT NULL DEFAULT 'ATIVO',
  "contaAtivoId" TEXT,
  "contaDepreciacaoAcumuladaId" TEXT,
  "contaDespesaId" TEXT,
  "observacoes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Imobilizado_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Imobilizado_empresaId_idx" ON "Imobilizado"("empresaId");

CREATE TABLE IF NOT EXISTS "DepreciacaoLancamento" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "imobilizadoId" TEXT NOT NULL,
  "competencia" TIMESTAMP(3) NOT NULL,
  "valor" DECIMAL(15,2) NOT NULL,
  "lancamentoContabilId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DepreciacaoLancamento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DepreciacaoLancamento_imobilizadoId_competencia_key" ON "DepreciacaoLancamento"("imobilizadoId", "competencia");
CREATE INDEX IF NOT EXISTS "DepreciacaoLancamento_empresaId_idx" ON "DepreciacaoLancamento"("empresaId");

-- ── Plano de contas: 1.2 Ativo Não Circulante (por empresa) ───────────────────
-- 1.2 sob o grupo raiz '1' (Ativo)
INSERT INTO "ContaContabil" ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId")
SELECT 'cc_'||r."empresaId"||'_1_2', r."empresaId", '1.2', 'Ativo Não Circulante',
  'ATIVO', 'DEVEDORA', 'SINTETICA', r."nivel" + 1, false, r."id"
FROM "ContaContabil" r WHERE r."codigo" = '1'
  AND NOT EXISTS (SELECT 1 FROM "ContaContabil" cc WHERE cc."empresaId"=r."empresaId" AND cc."codigo"='1.2')
ON CONFLICT ("empresaId","codigo") DO NOTHING;

-- 1.2.1 Imobilizado (sintética, pai das analíticas por bem) e
-- 1.2.2 (−) Depreciação Acumulada (analítica compartilhada, recebe os créditos)
INSERT INTO "ContaContabil" ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId")
SELECT 'cc_'||p."empresaId"||'_'||replace(novo.codigo,'.','_'), p."empresaId", novo.codigo, novo.nome,
  'ATIVO', novo.natureza::"NaturezaContabil", novo.tipo::"TipoContaContabil", p."nivel" + 1, novo.aceita, p."id"
FROM (VALUES
  ('1.2.1', 'Imobilizado',                'DEVEDORA', 'SINTETICA', false),
  ('1.2.2', '(-) Depreciação Acumulada',  'CREDORA',  'ANALITICA', true)
) AS novo(codigo, nome, natureza, tipo, aceita)
JOIN "ContaContabil" p ON p."codigo" = '1.2'
WHERE NOT EXISTS (SELECT 1 FROM "ContaContabil" cc WHERE cc."empresaId"=p."empresaId" AND cc."codigo"=novo.codigo)
ON CONFLICT ("empresaId","codigo") DO NOTHING;

-- 3.3.9003 Despesa de Depreciação (analítica de resultado, código reservado)
INSERT INTO "ContaContabil" ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId")
SELECT 'csis_'||p."empresaId"||'_3_3_9003', p."empresaId", '3.3.9003', 'Despesa de Depreciação',
  'RESULTADO', p."natureza", 'ANALITICA', p."nivel" + 1, true, p."id"
FROM "ContaContabil" p WHERE p."codigo" = '3.3'
  AND NOT EXISTS (SELECT 1 FROM "ContaContabil" cc WHERE cc."empresaId"=p."empresaId" AND cc."codigo"='3.3.9003')
ON CONFLICT ("empresaId","codigo") DO NOTHING;
