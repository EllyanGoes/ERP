-- Horários para escala de trabalho + escala (vigências) no colaborador.
-- Migration idempotente (padrão do projeto — nunca db push em prod).

CREATE TABLE IF NOT EXISTS "HorarioTrabalho" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HorarioTrabalho_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HorarioTrabalhoFaixa" (
  "id" TEXT NOT NULL,
  "horarioId" TEXT NOT NULL,
  "horaInicial" TEXT NOT NULL,
  "horaFinal" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "HorarioTrabalhoFaixa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ColaboradorEscala" (
  "id" TEXT NOT NULL,
  "colaboradorId" TEXT NOT NULL,
  "horarioId" TEXT NOT NULL,
  "data" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ColaboradorEscala_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "HorarioTrabalhoFaixa" ADD CONSTRAINT "HorarioTrabalhoFaixa_horarioId_fkey"
    FOREIGN KEY ("horarioId") REFERENCES "HorarioTrabalho"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ColaboradorEscala" ADD CONSTRAINT "ColaboradorEscala_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ColaboradorEscala" ADD CONSTRAINT "ColaboradorEscala_horarioId_fkey"
    FOREIGN KEY ("horarioId") REFERENCES "HorarioTrabalho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "HorarioTrabalhoFaixa_horarioId_idx" ON "HorarioTrabalhoFaixa"("horarioId");
CREATE INDEX IF NOT EXISTS "ColaboradorEscala_colaboradorId_data_idx" ON "ColaboradorEscala"("colaboradorId", "data");
