-- AlterTable
ALTER TABLE "ItemOrdemProducao" ADD COLUMN     "subprodutoDescricao" TEXT,
ADD COLUMN     "subprodutoItemId" TEXT,
ADD COLUMN     "tempoCicloHoras" DECIMAL(15,3);
