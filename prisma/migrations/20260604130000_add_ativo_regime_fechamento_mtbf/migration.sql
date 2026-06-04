-- CreateTable
CREATE TABLE "AtivoRegime" (
    "id" TEXT NOT NULL,
    "codApl" INTEGER NOT NULL,
    "horasPorDia" DOUBLE PRECISION NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtivoRegime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FechamentoMtbf" (
    "id" TEXT NOT NULL,
    "codApl" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "horasFuncionamento" DOUBLE PRECISION NOT NULL,
    "horasParadaNaoPlanejada" DOUBLE PRECISION NOT NULL,
    "numeroFalhas" INTEGER NOT NULL,
    "fechado" BOOLEAN NOT NULL DEFAULT false,
    "fechadoPor" TEXT,
    "fechadoEm" TIMESTAMP(3),
    "observacao" TEXT,
    "tag" TEXT,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FechamentoMtbf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AtivoRegime_codApl_key" ON "AtivoRegime"("codApl");

-- CreateIndex
CREATE UNIQUE INDEX "FechamentoMtbf_codApl_ano_mes_key" ON "FechamentoMtbf"("codApl", "ano", "mes");
