-- CreateEnum
CREATE TYPE "TipoFormaPagamento" AS ENUM ('DINHEIRO', 'PIX', 'TRANSFERENCIA', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'CHEQUE', 'OUTROS');

-- CreateTable
CREATE TABLE "CondicaoPagamento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "numeroParcelas" INTEGER NOT NULL DEFAULT 1,
    "prazoInicial" INTEGER NOT NULL DEFAULT 0,
    "intervaloParcelas" INTEGER NOT NULL DEFAULT 30,
    "descontoVista" DECIMAL(5,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CondicaoPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormaPagamento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoFormaPagamento" NOT NULL DEFAULT 'OUTROS',
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormaPagamento_pkey" PRIMARY KEY ("id")
);
