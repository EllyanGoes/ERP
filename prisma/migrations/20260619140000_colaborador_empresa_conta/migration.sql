-- Colaborador ↔ Empresa (M2M) + conta contábil por colaborador (sob Salários a
-- Pagar). Define onde o colaborador aparece nos lançamentos e onde sua conta é
-- criada. Idempotente.

-- 1) Conta por colaborador (analítica vinculada a um colaborador, uma por empresa).
ALTER TABLE "ContaContabil" ADD COLUMN IF NOT EXISTS "colaboradorId" text;
CREATE UNIQUE INDEX IF NOT EXISTS "ContaContabil_empresaId_colaboradorId_key" ON "ContaContabil" ("empresaId","colaboradorId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ContaContabil_colaboradorId_fkey') THEN
    ALTER TABLE "ContaContabil" ADD CONSTRAINT "ContaContabil_colaboradorId_fkey"
      FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 2) M2M Colaborador↔Empresa (implícita, relação "ColaboradorEmpresas").
CREATE TABLE IF NOT EXISTS "_ColaboradorEmpresas" ("A" text NOT NULL, "B" text NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS "_ColaboradorEmpresas_AB_unique" ON "_ColaboradorEmpresas" ("A","B");
CREATE INDEX IF NOT EXISTS "_ColaboradorEmpresas_B_index" ON "_ColaboradorEmpresas" ("B");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='_ColaboradorEmpresas_A_fkey') THEN
    ALTER TABLE "_ColaboradorEmpresas" ADD CONSTRAINT "_ColaboradorEmpresas_A_fkey"
      FOREIGN KEY ("A") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='_ColaboradorEmpresas_B_fkey') THEN
    ALTER TABLE "_ColaboradorEmpresas" ADD CONSTRAINT "_ColaboradorEmpresas_B_fkey"
      FOREIGN KEY ("B") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
