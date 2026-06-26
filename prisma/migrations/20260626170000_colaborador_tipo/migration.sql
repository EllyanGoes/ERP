DO $$ BEGIN
  CREATE TYPE "TipoColaborador" AS ENUM ('FUNCIONARIO', 'PRESTADOR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "Colaborador"
  ADD COLUMN IF NOT EXISTS "tipoColaborador" "TipoColaborador" NOT NULL DEFAULT 'FUNCIONARIO';
