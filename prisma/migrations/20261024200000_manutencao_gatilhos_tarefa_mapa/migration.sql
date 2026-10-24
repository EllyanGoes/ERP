-- Manutenção: gatilhos de plano (unidade do intervalo, margem do medidor), OS ligada à tarefa do
-- Projetos e posição dos ativos no mapa da planta. Idempotente.

ALTER TABLE "ManutAtivo" ADD COLUMN IF NOT EXISTS     "mapaAltura" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS     "mapaLargura" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS     "mapaX" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS     "mapaY" DOUBLE PRECISION;

ALTER TABLE "ManutOrdem" ADD COLUMN IF NOT EXISTS     "tarefaId" TEXT;

ALTER TABLE "ManutPlanoAtivo" ADD COLUMN IF NOT EXISTS     "margemMedida" DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS     "unidadeIntervalo" TEXT NOT NULL DEFAULT 'DIAS';

CREATE INDEX IF NOT EXISTS "ManutOrdem_tarefaId_idx" ON "ManutOrdem"("tarefaId");

DO $$ BEGIN
  ALTER TABLE "ManutOrdem" ADD CONSTRAINT "ManutOrdem_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "Tarefa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Etiqueta QR pública: código aleatório por ativo (não sequencial).
ALTER TABLE "ManutAtivo" ADD COLUMN IF NOT EXISTS "qrToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ManutAtivo_qrToken_key" ON "ManutAtivo"("qrToken");
UPDATE "ManutAtivo" SET "qrToken" = replace(gen_random_uuid()::text, '-', '') WHERE "qrToken" IS NULL;

-- Recorrência do plano (modelo Tractian) e materiais por atividade (OS e plano).

ALTER TABLE "ManutOrdemMaterial" ADD COLUMN IF NOT EXISTS     "servicoId" TEXT;

ALTER TABLE "ManutPlanoAtivo" ADD COLUMN IF NOT EXISTS     "agendarProxima" TEXT NOT NULL DEFAULT 'SEMPRE',
ADD COLUMN IF NOT EXISTS     "diaMes" INTEGER,
ADD COLUMN IF NOT EXISTS     "diasSemana" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN IF NOT EXISTS     "fimData" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "fimOcorrencias" INTEGER,
ADD COLUMN IF NOT EXISTS     "fimTipo" TEXT NOT NULL DEFAULT 'NUNCA',
ADD COLUMN IF NOT EXISTS     "horario" TEXT,
ADD COLUMN IF NOT EXISTS     "inicio" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "lembreteDias" INTEGER,
ADD COLUMN IF NOT EXISTS     "ocorrencias" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS     "repeticao" TEXT,
ADD COLUMN IF NOT EXISTS     "responsavelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS     "vencimentoDias" INTEGER;

ALTER TABLE "ManutPlanoMaterial" ADD COLUMN IF NOT EXISTS     "tarefaId" TEXT;

DO $$ BEGIN
  ALTER TABLE "ManutOrdemMaterial" ADD CONSTRAINT "ManutOrdemMaterial_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "ManutOrdemServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutPlanoMaterial" ADD CONSTRAINT "ManutPlanoMaterial_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "ManutPlanoTarefa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
