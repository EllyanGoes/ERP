-- CreateEnum
CREATE TYPE "StatusNecessidade" AS ENUM ('RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADA', 'REPROVADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusCotacaoCompra" AS ENUM ('RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADA', 'REPROVADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusRespostaFornecedor" AS ENUM ('AGUARDANDO', 'RESPONDIDA', 'RECUSADA');

-- CreateEnum
CREATE TYPE "StatusPedidoCompra" AS ENUM ('RASCUNHO', 'ENVIADO', 'CONFIRMADO', 'EM_TRANSITO', 'RECEBIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusConferenciaCompra" AS ENUM ('PENDENTE', 'EM_CONFERENCIA', 'CONCLUIDA', 'DIVERGENCIA');

-- AlterTable
ALTER TABLE "EstoqueItem" ADD COLUMN     "localEstoqueId" TEXT;

-- AlterTable
ALTER TABLE "Fornecedor" ADD COLUMN     "celular" TEXT,
ADD COLUMN     "contato" TEXT,
ADD COLUMN     "observacoes" TEXT;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "tipoProdutoId" TEXT,
ADD COLUMN     "unidadeId" TEXT;

-- AlterTable
ALTER TABLE "MovimentacaoEstoque" ADD COLUMN     "conferenciaItemId" TEXT;

-- CreateTable
CREATE TABLE "TipoProduto" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipoProduto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalEstoque" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unidade" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoFornecedor" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "codigoFornecedor" TEXT,
    "precoUltimo" DECIMAL(15,2),
    "prazoEntregaDias" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProdutoFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NecessidadeCompra" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "status" "StatusNecessidade" NOT NULL DEFAULT 'RASCUNHO',
    "solicitante" TEXT,
    "justificativa" TEXT,
    "dataNecessidade" TIMESTAMP(3),
    "observacoes" TEXT,
    "aprovadoPor" TEXT,
    "dataAprovacao" TIMESTAMP(3),
    "motivoReprovacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NecessidadeCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NecessidadeCompraItem" (
    "id" TEXT NOT NULL,
    "necessidadeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidade" DECIMAL(15,3) NOT NULL,
    "quantidadeAprovada" DECIMAL(15,3),
    "observacao" TEXT,

    CONSTRAINT "NecessidadeCompraItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoCompra" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "necessidadeId" TEXT,
    "status" "StatusCotacaoCompra" NOT NULL DEFAULT 'RASCUNHO',
    "dataLimiteResposta" TIMESTAMP(3),
    "observacoes" TEXT,
    "aprovadoPor" TEXT,
    "dataAprovacao" TIMESTAMP(3),
    "fornecedorVencedorId" TEXT,
    "motivoReprovacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CotacaoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoFornecedor" (
    "id" TEXT NOT NULL,
    "cotacaoId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "status" "StatusRespostaFornecedor" NOT NULL DEFAULT 'AGUARDANDO',
    "prazoEntregaDias" INTEGER,
    "condicoesPagamento" TEXT,
    "observacao" TEXT,
    "totalCalculado" DECIMAL(15,2),
    "melhorOpcao" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CotacaoFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoFornecedorItem" (
    "id" TEXT NOT NULL,
    "cotacaoFornecedorId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidade" DECIMAL(15,3) NOT NULL,
    "precoUnitario" DECIMAL(15,2),
    "subtotal" DECIMAL(15,2),
    "disponivel" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CotacaoFornecedorItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoCompra" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "cotacaoId" TEXT,
    "fornecedorId" TEXT NOT NULL,
    "status" "StatusPedidoCompra" NOT NULL DEFAULT 'RASCUNHO',
    "valorTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "dataEntregaPrevista" TIMESTAMP(3),
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoCompraItem" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidade" DECIMAL(15,3) NOT NULL,
    "precoUnitario" DECIMAL(15,2) NOT NULL,
    "valorTotal" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "PedidoCompraItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConferenciaCompra" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "status" "StatusConferenciaCompra" NOT NULL DEFAULT 'PENDENTE',
    "dataConferencia" TIMESTAMP(3),
    "responsavel" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConferenciaCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConferenciaCompraItem" (
    "id" TEXT NOT NULL,
    "conferenciaId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidadePedida" DECIMAL(15,3) NOT NULL,
    "quantidadeRecebida" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "divergencia" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,

    CONSTRAINT "ConferenciaCompraItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Unidade_sigla_key" ON "Unidade"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoFornecedor_itemId_fornecedorId_key" ON "ProdutoFornecedor"("itemId", "fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "NecessidadeCompra_numero_key" ON "NecessidadeCompra"("numero");

-- CreateIndex
CREATE INDEX "NecessidadeCompra_status_idx" ON "NecessidadeCompra"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CotacaoCompra_numero_key" ON "CotacaoCompra"("numero");

-- CreateIndex
CREATE INDEX "CotacaoCompra_status_idx" ON "CotacaoCompra"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CotacaoFornecedor_cotacaoId_fornecedorId_key" ON "CotacaoFornecedor"("cotacaoId", "fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoCompra_numero_key" ON "PedidoCompra"("numero");

-- CreateIndex
CREATE INDEX "PedidoCompra_status_idx" ON "PedidoCompra"("status");

-- CreateIndex
CREATE INDEX "PedidoCompra_fornecedorId_idx" ON "PedidoCompra"("fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "ConferenciaCompra_numero_key" ON "ConferenciaCompra"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "ConferenciaCompra_pedidoId_key" ON "ConferenciaCompra"("pedidoId");

-- CreateIndex
CREATE INDEX "ConferenciaCompra_status_idx" ON "ConferenciaCompra"("status");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_tipoProdutoId_fkey" FOREIGN KEY ("tipoProdutoId") REFERENCES "TipoProduto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoFornecedor" ADD CONSTRAINT "ProdutoFornecedor_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoFornecedor" ADD CONSTRAINT "ProdutoFornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueItem" ADD CONSTRAINT "EstoqueItem_localEstoqueId_fkey" FOREIGN KEY ("localEstoqueId") REFERENCES "LocalEstoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_conferenciaItemId_fkey" FOREIGN KEY ("conferenciaItemId") REFERENCES "ConferenciaCompraItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NecessidadeCompraItem" ADD CONSTRAINT "NecessidadeCompraItem_necessidadeId_fkey" FOREIGN KEY ("necessidadeId") REFERENCES "NecessidadeCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NecessidadeCompraItem" ADD CONSTRAINT "NecessidadeCompraItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoCompra" ADD CONSTRAINT "CotacaoCompra_necessidadeId_fkey" FOREIGN KEY ("necessidadeId") REFERENCES "NecessidadeCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedor" ADD CONSTRAINT "CotacaoFornecedor_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "CotacaoCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedor" ADD CONSTRAINT "CotacaoFornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedorItem" ADD CONSTRAINT "CotacaoFornecedorItem_cotacaoFornecedorId_fkey" FOREIGN KEY ("cotacaoFornecedorId") REFERENCES "CotacaoFornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedorItem" ADD CONSTRAINT "CotacaoFornecedorItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "CotacaoCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompraItem" ADD CONSTRAINT "PedidoCompraItem_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompraItem" ADD CONSTRAINT "PedidoCompraItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenciaCompra" ADD CONSTRAINT "ConferenciaCompra_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenciaCompraItem" ADD CONSTRAINT "ConferenciaCompraItem_conferenciaId_fkey" FOREIGN KEY ("conferenciaId") REFERENCES "ConferenciaCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenciaCompraItem" ADD CONSTRAINT "ConferenciaCompraItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
