-- AlterTable
ALTER TABLE "MovimentacaoEstoque" ADD COLUMN     "ordemProducaoId" TEXT;

-- CreateIndex
CREATE INDEX "MovimentacaoEstoque_ordemProducaoId_idx" ON "MovimentacaoEstoque"("ordemProducaoId");

-- AddForeignKey
ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_ordemProducaoId_fkey" FOREIGN KEY ("ordemProducaoId") REFERENCES "OrdemProducao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
