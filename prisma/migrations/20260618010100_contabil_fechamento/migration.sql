-- Fechamento/encerramento do exercício: tabela de controle + conta de PL para
-- receber o resultado apurado. Idempotente.

DO $$ BEGIN
  CREATE TYPE "StatusFechamento" AS ENUM ('FECHADO', 'REABERTO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "FechamentoContabil" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin',
  "exercicio" INTEGER NOT NULL,
  "dataInicio" TIMESTAMP(3) NOT NULL,
  "dataFim" TIMESTAMP(3) NOT NULL,
  "resultado" DECIMAL(15,2) NOT NULL,
  "lancamentoId" TEXT,
  "status" "StatusFechamento" NOT NULL DEFAULT 'FECHADO',
  "reabertoEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FechamentoContabil_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FechamentoContabil_empresaId_exercicio_key" ON "FechamentoContabil"("empresaId", "exercicio");
CREATE INDEX IF NOT EXISTS "FechamentoContabil_empresaId_idx" ON "FechamentoContabil"("empresaId");

-- Analítica de PL que recebe o resultado do exercício, sob 2.3.2 Lucros/Prejuízos
-- Acumulados (que é sintética). Uma por empresa.
INSERT INTO "ContaContabil" ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId")
SELECT 'cpl_'||p."empresaId"||'_2_3_2_0001', p."empresaId", '2.3.2.0001', 'Lucros/Prejuízos Acumulados',
  'PATRIMONIO_LIQUIDO', 'CREDORA', 'ANALITICA', p."nivel" + 1, true, p."id"
FROM "ContaContabil" p WHERE p."codigo" = '2.3.2'
  AND NOT EXISTS (SELECT 1 FROM "ContaContabil" cc WHERE cc."empresaId"=p."empresaId" AND cc."codigo"='2.3.2.0001')
ON CONFLICT ("empresaId","codigo") DO NOTHING;
