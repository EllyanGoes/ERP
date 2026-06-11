-- Tabelas de preço por empresa do grupo: cada empresa tem as suas (a da
-- Cimento e Mix é diferente da Tramontin e da Atlas). Tabelas existentes
-- ficam na Tramontin (default); código passa a ser único por empresa.

ALTER TABLE "TabelaPreco" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';

DO $do$ BEGIN
  ALTER TABLE "TabelaPreco"
    ADD CONSTRAINT "TabelaPreco_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE INDEX IF NOT EXISTS "TabelaPreco_empresaId_idx" ON "TabelaPreco"("empresaId");

-- código único POR EMPRESA (era único global; em alguns bancos o unique é
-- constraint, em outros índice solto — trata os dois)
ALTER TABLE "TabelaPreco" DROP CONSTRAINT IF EXISTS "TabelaPreco_codigo_key";
DROP INDEX IF EXISTS "TabelaPreco_codigo_key";
CREATE UNIQUE INDEX IF NOT EXISTS "TabelaPreco_empresaId_codigo_key"
  ON "TabelaPreco"("empresaId", "codigo");
