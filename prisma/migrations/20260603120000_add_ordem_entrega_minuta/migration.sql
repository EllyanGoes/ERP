-- AlterTable
ALTER TABLE "Minuta" ADD COLUMN     "ordemEntrega" INTEGER;

-- CreateIndex
CREATE INDEX "Minuta_motoristaId_dataEntrega_idx" ON "Minuta"("motoristaId", "dataEntrega");
