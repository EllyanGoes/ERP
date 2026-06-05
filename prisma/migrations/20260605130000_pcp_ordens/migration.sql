-- CreateEnum
CREATE TYPE "StatusOrdemProducao" AS ENUM ('RASCUNHO', 'LIBERADA', 'EM_PRODUCAO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusEtapaOP" AS ENUM ('PENDENTE', 'EM_EXECUCAO', 'CONCLUIDA');

-- CreateTable
CREATE TABLE "OrdemProducao" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "itemId" TEXT,
    "fluxoVersaoId" TEXT NOT NULL,
    "quantidadePlanejada" DECIMAL(15,3) NOT NULL,
    "unidade" TEXT,
    "status" "StatusOrdemProducao" NOT NULL DEFAULT 'RASCUNHO',
    "estadoAtual" "EstadoWIP" NOT NULL DEFAULT 'UMIDO',
    "dataPrevista" TIMESTAMP(3),
    "observacao" TEXT,
    "criadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdemProducao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemOrdemProducao" (
    "id" TEXT NOT NULL,
    "ordemProducaoId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "kind" "KindNo" NOT NULL,
    "centroTrabalho" TEXT,
    "estadoSaida" "EstadoWIP",
    "status" "StatusEtapaOP" NOT NULL DEFAULT 'PENDENTE',
    "qtdEntrada" DECIMAL(15,3),
    "qtdSaida" DECIMAL(15,3),
    "qtdPerda" DECIMAL(15,3),
    "vagoes" INTEGER,
    "vagonetas" INTEGER,
    "inicioReal" TIMESTAMP(3),
    "fimReal" TIMESTAMP(3),
    "apontadoPor" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemOrdemProducao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumoBiomassa" (
    "id" TEXT NOT NULL,
    "ordemProducaoId" TEXT NOT NULL,
    "itemOrdemProducaoId" TEXT,
    "descricao" TEXT,
    "quantidadeKg" DECIMAL(15,3) NOT NULL,
    "milheirosProduzidos" DECIMAL(15,3),
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registradoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumoBiomassa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrdemProducao_numero_key" ON "OrdemProducao"("numero");

-- CreateIndex
CREATE INDEX "OrdemProducao_status_idx" ON "OrdemProducao"("status");

-- CreateIndex
CREATE INDEX "OrdemProducao_itemId_idx" ON "OrdemProducao"("itemId");

-- CreateIndex
CREATE INDEX "OrdemProducao_fluxoVersaoId_idx" ON "OrdemProducao"("fluxoVersaoId");

-- CreateIndex
CREATE INDEX "ItemOrdemProducao_ordemProducaoId_idx" ON "ItemOrdemProducao"("ordemProducaoId");

-- CreateIndex
CREATE INDEX "ItemOrdemProducao_status_idx" ON "ItemOrdemProducao"("status");

-- CreateIndex
CREATE INDEX "ConsumoBiomassa_ordemProducaoId_idx" ON "ConsumoBiomassa"("ordemProducaoId");

-- AddForeignKey
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_fluxoVersaoId_fkey" FOREIGN KEY ("fluxoVersaoId") REFERENCES "FluxoProducaoVersao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOrdemProducao" ADD CONSTRAINT "ItemOrdemProducao_ordemProducaoId_fkey" FOREIGN KEY ("ordemProducaoId") REFERENCES "OrdemProducao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoBiomassa" ADD CONSTRAINT "ConsumoBiomassa_ordemProducaoId_fkey" FOREIGN KEY ("ordemProducaoId") REFERENCES "OrdemProducao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
