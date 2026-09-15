-- Cache das consultas ao Dexion. Idempotente.
CREATE TABLE IF NOT EXISTS "DexionCache" (
  "chave"        TEXT NOT NULL,
  "dados"        JSONB NOT NULL,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DexionCache_pkey" PRIMARY KEY ("chave")
);
