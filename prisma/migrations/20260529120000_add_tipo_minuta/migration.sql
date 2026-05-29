-- CreateEnum
CREATE TYPE "TipoMinuta" AS ENUM ('ENTREGA', 'RETIRADA');

-- AlterTable
ALTER TABLE "Minuta" ADD COLUMN     "tipo" "TipoMinuta" NOT NULL DEFAULT 'ENTREGA';
