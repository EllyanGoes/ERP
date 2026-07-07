-- Folha de diárias assinada (upload do escaneado após coleta de assinaturas).
-- Migration idempotente (padrão do projeto — nunca db push em prod).
ALTER TABLE "DiariaFolha" ADD COLUMN IF NOT EXISTS "arquivoAssinadoUrl" TEXT;
ALTER TABLE "DiariaFolha" ADD COLUMN IF NOT EXISTS "arquivoAssinadoNome" TEXT;
