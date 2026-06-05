-- CreateEnum
CREATE TYPE "OrigemDemanda" AS ENUM ('MANUAL', 'PEDIDO_VENDA', 'MIN_MAX');

-- CreateTable
CREATE TABLE "PlanoMestre" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "quantidade" DECIMAL(15,3) NOT NULL,
    "origem" "OrigemDemanda" NOT NULL DEFAULT 'MANUAL',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanoMestre_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanoMestre_itemId_idx" ON "PlanoMestre"("itemId");

-- CreateIndex
CREATE INDEX "PlanoMestre_periodo_idx" ON "PlanoMestre"("periodo");

-- AddForeignKey
ALTER TABLE "PlanoMestre" ADD CONSTRAINT "PlanoMestre_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
