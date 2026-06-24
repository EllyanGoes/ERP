-- Parâmetros de custeio por competência (biomassa/energia/combustível/folha) para
-- derivar a taxa predeterminada de CIF/MOD por milheiro. Aditivo e idempotente.
CREATE TABLE IF NOT EXISTS "ParametroCusteio" (
  "id"              TEXT NOT NULL,
  "empresaId"       TEXT NOT NULL DEFAULT 'emp_tramontin',
  "competencia"     TIMESTAMP(3) NOT NULL,
  "biomassaDia"     DECIMAL(15,2) NOT NULL DEFAULT 0,
  "energiaMes"      DECIMAL(15,2) NOT NULL DEFAULT 0,
  "combustivelDia"  DECIMAL(15,2) NOT NULL DEFAULT 0,
  "folhaMes"        DECIMAL(15,2) NOT NULL DEFAULT 0,
  "diasTrabalhados" INTEGER NOT NULL DEFAULT 26,
  "observacao"      TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ParametroCusteio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ParametroCusteio_empresaId_competencia_key" ON "ParametroCusteio"("empresaId", "competencia");
CREATE INDEX IF NOT EXISTS "ParametroCusteio_empresaId_idx" ON "ParametroCusteio"("empresaId");

DO $$ BEGIN
  ALTER TABLE "ParametroCusteio" ADD CONSTRAINT "ParametroCusteio_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
