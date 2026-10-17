-- Exclusão de colaborador passa por aprovação (fluxo EXCLUSAO_COLABORADOR).
ALTER TYPE "ProcessoAprovacao" ADD VALUE IF NOT EXISTS 'EXCLUSAO_COLABORADOR';

CREATE TABLE IF NOT EXISTS "SolicitacaoExclusao" (
  "id" TEXT NOT NULL,
  "entidade" TEXT NOT NULL,
  "registroId" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "motivo" TEXT,
  "status" "StatusAprovacao" NOT NULL DEFAULT 'PENDENTE',
  "solicitadoPor" TEXT,
  "solicitadoPorNome" TEXT,
  "aprovadorId" TEXT NOT NULL,
  "observacao" TEXT,
  "respondidoEm" TIMESTAMP(3),
  "snapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SolicitacaoExclusao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SolicitacaoExclusao_aprovadorId_status_idx" ON "SolicitacaoExclusao"("aprovadorId", "status");
CREATE INDEX IF NOT EXISTS "SolicitacaoExclusao_entidade_registroId_idx" ON "SolicitacaoExclusao"("entidade", "registroId");
