-- Integração Dexion: vínculo empresa×exercício e De-Para de contas. Idempotente.
CREATE TABLE IF NOT EXISTS "DexionVinculoEmpresa" (
  "id"           TEXT NOT NULL,
  "empresaId"    TEXT NOT NULL,
  "exercicio"    INTEGER NOT NULL,
  "codigoDexion" INTEGER NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DexionVinculoEmpresa_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DexionVinculoEmpresa_empresaId_exercicio_key" ON "DexionVinculoEmpresa"("empresaId", "exercicio");

CREATE TABLE IF NOT EXISTS "DexionDePara" (
  "id"              TEXT NOT NULL,
  "empresaId"       TEXT NOT NULL,
  "contaDexion"     TEXT NOT NULL,
  "contaContabilId" TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DexionDePara_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DexionDePara_empresaId_contaDexion_key" ON "DexionDePara"("empresaId", "contaDexion");
CREATE INDEX IF NOT EXISTS "DexionDePara_contaContabilId_idx" ON "DexionDePara"("contaContabilId");
DO $$ BEGIN
  ALTER TABLE "DexionDePara" ADD CONSTRAINT "DexionDePara_contaContabilId_fkey"
    FOREIGN KEY ("contaContabilId") REFERENCES "ContaContabil"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
