-- Lixeira de documentos: snapshot completo antes de cada DELETE destrutivo,
-- para consulta e restauração (retenção de 90 dias via cron). Aditivo/idempotente.
CREATE TABLE IF NOT EXISTS "Lixeira" (
  "id"               TEXT NOT NULL,
  "empresaId"        TEXT NOT NULL DEFAULT 'emp_tramontin',
  "tipo"             TEXT NOT NULL,
  "origemId"         TEXT NOT NULL,
  "numero"           TEXT,
  "descricao"        TEXT,
  "snapshot"         JSONB NOT NULL,
  "apagadoPor"       TEXT,
  "restauradoEm"     TIMESTAMP(3),
  "restauradoComoId" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Lixeira_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Lixeira_empresaId_tipo_idx" ON "Lixeira"("empresaId", "tipo");
CREATE INDEX IF NOT EXISTS "Lixeira_createdAt_idx" ON "Lixeira"("createdAt");
CREATE INDEX IF NOT EXISTS "Lixeira_numero_idx" ON "Lixeira"("numero");
