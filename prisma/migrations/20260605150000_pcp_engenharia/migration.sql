-- CreateEnum
CREATE TYPE "BaseConsumo" AS ENUM ('POR_MILHEIRO', 'POR_UNIDADE', 'POR_CICLO', 'POR_VAGAO');

-- CreateEnum
CREATE TYPE "CategoriaInsumo" AS ENUM ('MATERIA_PRIMA', 'MISTURA', 'EMBALAGEM', 'ENERGIA', 'OUTRO');

-- CreateTable
CREATE TABLE "EngenhariaProduto" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fluxoId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngenhariaProduto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngenhariaInsumo" (
    "id" TEXT NOT NULL,
    "engenhariaId" TEXT NOT NULL,
    "insumoItemId" TEXT NOT NULL,
    "quantidade" DECIMAL(15,3) NOT NULL,
    "base" "BaseConsumo" NOT NULL DEFAULT 'POR_MILHEIRO',
    "categoria" "CategoriaInsumo" NOT NULL DEFAULT 'MATERIA_PRIMA',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngenhariaInsumo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EngenhariaProduto_itemId_key" ON "EngenhariaProduto"("itemId");

-- CreateIndex
CREATE INDEX "EngenhariaProduto_fluxoId_idx" ON "EngenhariaProduto"("fluxoId");

-- CreateIndex
CREATE INDEX "EngenhariaInsumo_engenhariaId_idx" ON "EngenhariaInsumo"("engenhariaId");

-- CreateIndex
CREATE INDEX "EngenhariaInsumo_insumoItemId_idx" ON "EngenhariaInsumo"("insumoItemId");

-- AddForeignKey
ALTER TABLE "EngenhariaProduto" ADD CONSTRAINT "EngenhariaProduto_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngenhariaProduto" ADD CONSTRAINT "EngenhariaProduto_fluxoId_fkey" FOREIGN KEY ("fluxoId") REFERENCES "FluxoProducao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngenhariaInsumo" ADD CONSTRAINT "EngenhariaInsumo_engenhariaId_fkey" FOREIGN KEY ("engenhariaId") REFERENCES "EngenhariaProduto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngenhariaInsumo" ADD CONSTRAINT "EngenhariaInsumo_insumoItemId_fkey" FOREIGN KEY ("insumoItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
