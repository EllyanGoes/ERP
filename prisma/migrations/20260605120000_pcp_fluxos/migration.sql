-- CreateEnum
CREATE TYPE "TipoCentroTrabalho" AS ENUM ('PREPARACAO', 'CONFORMACAO', 'SECAGEM', 'FORNO', 'EMBALAGEM', 'TRANSPORTE', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusFluxoVersao" AS ENUM ('RASCUNHO', 'PUBLICADA', 'ARQUIVADA');

-- CreateEnum
CREATE TYPE "KindNo" AS ENUM ('ESTOQUE_INSUMO', 'OPERACAO', 'TRANSPORTE', 'BUFFER_WIP', 'INSPECAO', 'ESTOCAGEM_PA');

-- CreateEnum
CREATE TYPE "EstadoWIP" AS ENUM ('UMIDO', 'SECO', 'QUEIMADO', 'ACABADO');

-- CreateTable
CREATE TABLE "CentroTrabalho" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoCentroTrabalho",
    "codApl" INTEGER,
    "capacidadePadrao" DECIMAL(15,3),
    "unidadeCapacidade" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentroTrabalho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FluxoProducao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "itemId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "versaoAtivaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FluxoProducao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FluxoProducaoVersao" (
    "id" TEXT NOT NULL,
    "fluxoProducaoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "status" "StatusFluxoVersao" NOT NULL DEFAULT 'RASCUNHO',
    "grafo" JSONB NOT NULL,
    "publicadoPor" TEXT,
    "publicadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FluxoProducaoVersao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CentroTrabalho_codigo_key" ON "CentroTrabalho"("codigo");

-- CreateIndex
CREATE INDEX "CentroTrabalho_codApl_idx" ON "CentroTrabalho"("codApl");

-- CreateIndex
CREATE INDEX "FluxoProducao_itemId_idx" ON "FluxoProducao"("itemId");

-- CreateIndex
CREATE INDEX "FluxoProducaoVersao_fluxoProducaoId_idx" ON "FluxoProducaoVersao"("fluxoProducaoId");

-- CreateIndex
CREATE UNIQUE INDEX "FluxoProducaoVersao_fluxoProducaoId_versao_key" ON "FluxoProducaoVersao"("fluxoProducaoId", "versao");

-- AddForeignKey
ALTER TABLE "FluxoProducao" ADD CONSTRAINT "FluxoProducao_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FluxoProducaoVersao" ADD CONSTRAINT "FluxoProducaoVersao_fluxoProducaoId_fkey" FOREIGN KEY ("fluxoProducaoId") REFERENCES "FluxoProducao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
