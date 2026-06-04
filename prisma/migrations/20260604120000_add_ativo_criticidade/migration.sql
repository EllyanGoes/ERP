-- CreateEnum
CREATE TYPE "Criticidade" AS ENUM ('A', 'B', 'C');

-- CreateTable
CREATE TABLE "AtivoCriticidade" (
    "id" TEXT NOT NULL,
    "codApl" INTEGER NOT NULL,
    "criticidade" "Criticidade" NOT NULL,
    "tag" TEXT,
    "descricao" TEXT,
    "classificadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtivoCriticidade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AtivoCriticidade_codApl_key" ON "AtivoCriticidade"("codApl");
