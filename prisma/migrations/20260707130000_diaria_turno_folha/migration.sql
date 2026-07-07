-- Turno (DIA | NOITE) no cabeçalho da folha de diárias.
-- Migration idempotente (padrão do projeto — nunca db push em prod).
ALTER TABLE "DiariaFolha" ADD COLUMN IF NOT EXISTS "turno" TEXT NOT NULL DEFAULT 'DIA';

-- Backfill: folha cujos blocos são todos NOITE vira NOITE.
UPDATE "DiariaFolha" f SET "turno" = 'NOITE'
WHERE f."turno" = 'DIA'
  AND EXISTS (SELECT 1 FROM "DiariaGrupo" g WHERE g."folhaId" = f.id AND g."turno" = 'NOITE')
  AND NOT EXISTS (SELECT 1 FROM "DiariaGrupo" g WHERE g."folhaId" = f.id AND g."turno" = 'DIA');
