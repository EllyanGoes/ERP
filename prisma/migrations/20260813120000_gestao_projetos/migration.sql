-- Gestão de Projetos (módulo standalone estilo Trello/Asana)
DO $$ BEGIN CREATE TYPE "VisibilidadeProjeto" AS ENUM ('PRIVADO', 'PUBLICO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "StatusProjeto" AS ENUM ('ATIVO', 'ARQUIVADO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PrioridadeTarefa" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "Projeto" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "cor" TEXT,
    "icone" TEXT,
    "visibilidade" "VisibilidadeProjeto" NOT NULL DEFAULT 'PRIVADO',
    "status" "StatusProjeto" NOT NULL DEFAULT 'ATIVO',
    "donoId" TEXT NOT NULL,
    "criadoPor" TEXT,
    "atualizadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Projeto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Projeto_status_idx" ON "Projeto"("status");
CREATE INDEX IF NOT EXISTS "Projeto_donoId_idx" ON "Projeto"("donoId");

CREATE TABLE IF NOT EXISTS "ProjetoMembro" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "papel" TEXT NOT NULL DEFAULT 'MEMBRO',
    "favorito" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ProjetoMembro_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProjetoMembro_projetoId_usuarioId_key" ON "ProjetoMembro"("projetoId", "usuarioId");
CREATE INDEX IF NOT EXISTS "ProjetoMembro_usuarioId_idx" ON "ProjetoMembro"("usuarioId");

CREATE TABLE IF NOT EXISTS "ProjetoColuna" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "cor" TEXT,
    "concluiTarefa" BOOLEAN NOT NULL DEFAULT false,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ProjetoColuna_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProjetoColuna_projetoId_ordem_idx" ON "ProjetoColuna"("projetoId", "ordem");

CREATE TABLE IF NOT EXISTS "ProjetoEtiqueta" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL,
    CONSTRAINT "ProjetoEtiqueta_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProjetoEtiqueta_projetoId_idx" ON "ProjetoEtiqueta"("projetoId");

CREATE TABLE IF NOT EXISTS "Tarefa" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "colunaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL,
    "prioridade" "PrioridadeTarefa" NOT NULL DEFAULT 'MEDIA',
    "responsavelId" TEXT,
    "dataInicio" TIMESTAMP(3),
    "prazo" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "arquivada" BOOLEAN NOT NULL DEFAULT false,
    "criadoPor" TEXT,
    "atualizadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tarefa_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Tarefa_projetoId_colunaId_ordem_idx" ON "Tarefa"("projetoId", "colunaId", "ordem");
CREATE INDEX IF NOT EXISTS "Tarefa_responsavelId_prazo_idx" ON "Tarefa"("responsavelId", "prazo");
CREATE INDEX IF NOT EXISTS "Tarefa_prazo_idx" ON "Tarefa"("prazo");

CREATE TABLE IF NOT EXISTS "TarefaEtiqueta" (
    "tarefaId" TEXT NOT NULL,
    "etiquetaId" TEXT NOT NULL,
    CONSTRAINT "TarefaEtiqueta_pkey" PRIMARY KEY ("tarefaId", "etiquetaId")
);

CREATE TABLE IF NOT EXISTS "TarefaChecklistItem" (
    "id" TEXT NOT NULL,
    "tarefaId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "feito" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL,
    CONSTRAINT "TarefaChecklistItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TarefaChecklistItem_tarefaId_ordem_idx" ON "TarefaChecklistItem"("tarefaId", "ordem");

CREATE TABLE IF NOT EXISTS "TarefaComentario" (
    "id" TEXT NOT NULL,
    "tarefaId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEm" TIMESTAMP(3),
    CONSTRAINT "TarefaComentario_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TarefaComentario_tarefaId_createdAt_idx" ON "TarefaComentario"("tarefaId", "createdAt");

CREATE TABLE IF NOT EXISTS "AnexoTarefa" (
    "id" TEXT NOT NULL,
    "tarefaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "criadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnexoTarefa_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AnexoTarefa_tarefaId_idx" ON "AnexoTarefa"("tarefaId");

CREATE TABLE IF NOT EXISTS "TarefaAtividade" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "tarefaId" TEXT,
    "autorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "detalhe" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TarefaAtividade_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TarefaAtividade_tarefaId_createdAt_idx" ON "TarefaAtividade"("tarefaId", "createdAt");
CREATE INDEX IF NOT EXISTS "TarefaAtividade_projetoId_createdAt_idx" ON "TarefaAtividade"("projetoId", "createdAt");

DO $$ BEGIN ALTER TABLE "Projeto" ADD CONSTRAINT "Projeto_donoId_fkey" FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ProjetoMembro" ADD CONSTRAINT "ProjetoMembro_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ProjetoMembro" ADD CONSTRAINT "ProjetoMembro_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ProjetoColuna" ADD CONSTRAINT "ProjetoColuna_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ProjetoEtiqueta" ADD CONSTRAINT "ProjetoEtiqueta_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_colunaId_fkey" FOREIGN KEY ("colunaId") REFERENCES "ProjetoColuna"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TarefaEtiqueta" ADD CONSTRAINT "TarefaEtiqueta_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "Tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TarefaEtiqueta" ADD CONSTRAINT "TarefaEtiqueta_etiquetaId_fkey" FOREIGN KEY ("etiquetaId") REFERENCES "ProjetoEtiqueta"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TarefaChecklistItem" ADD CONSTRAINT "TarefaChecklistItem_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "Tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TarefaComentario" ADD CONSTRAINT "TarefaComentario_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "Tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TarefaComentario" ADD CONSTRAINT "TarefaComentario_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "AnexoTarefa" ADD CONSTRAINT "AnexoTarefa_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "Tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TarefaAtividade" ADD CONSTRAINT "TarefaAtividade_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TarefaAtividade" ADD CONSTRAINT "TarefaAtividade_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "Tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TarefaAtividade" ADD CONSTRAINT "TarefaAtividade_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
