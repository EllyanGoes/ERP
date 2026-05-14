-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('FISICA', 'JURIDICA');

-- CreateEnum
CREATE TYPE "StatusCliente" AS ENUM ('ATIVO', 'INATIVO', 'PROSPECTO');

-- CreateEnum
CREATE TYPE "TipoItem" AS ENUM ('PRODUTO', 'SERVICO', 'MATERIA_PRIMA');

-- CreateEnum
CREATE TYPE "UnidadeMedida" AS ENUM ('UN', 'KG', 'LT', 'MT', 'CX', 'PC', 'HR');

-- CreateEnum
CREATE TYPE "StatusPedidoVenda" AS ENUM ('ORCAMENTO', 'CONFIRMADO', 'EM_PRODUCAO', 'FATURADO', 'ENTREGUE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoMovimentacaoEstoque" AS ENUM ('ENTRADA', 'SAIDA', 'AJUSTE', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "StatusConta" AS ENUM ('ABERTA', 'PAGA', 'VENCIDA', 'CANCELADA', 'PARCIAL');

-- CreateEnum
CREATE TYPE "TipoLancamentoCaixa" AS ENUM ('RECEITA', 'DESPESA', 'TRANSFERENCIA');

-- CreateTable
CREATE TABLE "Sequencia" (
    "prefixo" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Sequencia_pkey" PRIMARY KEY ("prefixo")
);

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT NOT NULL,
    "ie" TEXT,
    "im" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "tipoPessoa" "TipoPessoa" NOT NULL DEFAULT 'JURIDICA',
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cpfCnpj" TEXT NOT NULL,
    "ie" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "celular" TEXT,
    "status" "StatusCliente" NOT NULL DEFAULT 'ATIVO',
    "observacoes" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" TEXT NOT NULL,
    "tipoPessoa" "TipoPessoa" NOT NULL DEFAULT 'JURIDICA',
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cpfCnpj" TEXT NOT NULL,
    "ie" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoItem" NOT NULL DEFAULT 'PRODUTO',
    "unidadeMedida" "UnidadeMedida" NOT NULL DEFAULT 'UN',
    "ncm" TEXT,
    "cest" TEXT,
    "precoVenda" DECIMAL(15,2) NOT NULL,
    "precoCusto" DECIMAL(15,2),
    "pesoLiquido" DECIMAL(10,3),
    "pesoBruto" DECIMAL(10,3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstoqueItem" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidadeAtual" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "quantidadeMin" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "quantidadeMax" DECIMAL(15,3),
    "localizacao" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstoqueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentacaoEstoque" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tipo" "TipoMovimentacaoEstoque" NOT NULL,
    "quantidade" DECIMAL(15,3) NOT NULL,
    "saldoAntes" DECIMAL(15,3) NOT NULL,
    "saldoDepois" DECIMAL(15,3) NOT NULL,
    "documento" TEXT,
    "observacoes" TEXT,
    "criadoPor" TEXT,
    "pedidoVendaItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentacaoEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoVenda" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "status" "StatusPedidoVenda" NOT NULL DEFAULT 'ORCAMENTO',
    "dataEmissao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataEntrega" TIMESTAMP(3),
    "valorProdutos" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "valorDesconto" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "valorFrete" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "condicaoPagamento" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoVenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoVendaItem" (
    "id" TEXT NOT NULL,
    "pedidoVendaId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidade" DECIMAL(15,3) NOT NULL,
    "precoUnitario" DECIMAL(15,2) NOT NULL,
    "desconto" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "PedidoVendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaReceber" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "pedidoVendaId" TEXT,
    "descricao" TEXT NOT NULL,
    "valorOriginal" DECIMAL(15,2) NOT NULL,
    "valorPago" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "valorMulta" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "valorJuros" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "dataPagamento" TIMESTAMP(3),
    "status" "StatusConta" NOT NULL DEFAULT 'ABERTA',
    "formaPagamento" TEXT,
    "nossoNumero" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaReceber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaPagar" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT,
    "valorOriginal" DECIMAL(15,2) NOT NULL,
    "valorPago" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "valorMulta" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "valorJuros" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "dataPagamento" TIMESTAMP(3),
    "status" "StatusConta" NOT NULL DEFAULT 'ABERTA',
    "formaPagamento" TEXT,
    "notaFiscal" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaPagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LancamentoCaixa" (
    "id" TEXT NOT NULL,
    "tipo" "TipoLancamentoCaixa" NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "dataLancamento" TIMESTAMP(3) NOT NULL,
    "contaReceberId" TEXT,
    "contaPagarId" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LancamentoCaixa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_cnpj_key" ON "Empresa"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_cpfCnpj_key" ON "Cliente"("cpfCnpj");

-- CreateIndex
CREATE INDEX "Cliente_cpfCnpj_idx" ON "Cliente"("cpfCnpj");

-- CreateIndex
CREATE INDEX "Cliente_status_idx" ON "Cliente"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_cpfCnpj_key" ON "Fornecedor"("cpfCnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Item_codigo_key" ON "Item"("codigo");

-- CreateIndex
CREATE INDEX "Item_codigo_idx" ON "Item"("codigo");

-- CreateIndex
CREATE INDEX "Item_tipo_idx" ON "Item"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "EstoqueItem_itemId_key" ON "EstoqueItem"("itemId");

-- CreateIndex
CREATE INDEX "MovimentacaoEstoque_itemId_idx" ON "MovimentacaoEstoque"("itemId");

-- CreateIndex
CREATE INDEX "MovimentacaoEstoque_tipo_idx" ON "MovimentacaoEstoque"("tipo");

-- CreateIndex
CREATE INDEX "MovimentacaoEstoque_createdAt_idx" ON "MovimentacaoEstoque"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoVenda_numero_key" ON "PedidoVenda"("numero");

-- CreateIndex
CREATE INDEX "PedidoVenda_clienteId_idx" ON "PedidoVenda"("clienteId");

-- CreateIndex
CREATE INDEX "PedidoVenda_status_idx" ON "PedidoVenda"("status");

-- CreateIndex
CREATE INDEX "PedidoVenda_dataEmissao_idx" ON "PedidoVenda"("dataEmissao");

-- CreateIndex
CREATE INDEX "PedidoVendaItem_pedidoVendaId_idx" ON "PedidoVendaItem"("pedidoVendaId");

-- CreateIndex
CREATE INDEX "PedidoVendaItem_itemId_idx" ON "PedidoVendaItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ContaReceber_numero_key" ON "ContaReceber"("numero");

-- CreateIndex
CREATE INDEX "ContaReceber_clienteId_idx" ON "ContaReceber"("clienteId");

-- CreateIndex
CREATE INDEX "ContaReceber_status_idx" ON "ContaReceber"("status");

-- CreateIndex
CREATE INDEX "ContaReceber_dataVencimento_idx" ON "ContaReceber"("dataVencimento");

-- CreateIndex
CREATE UNIQUE INDEX "ContaPagar_numero_key" ON "ContaPagar"("numero");

-- CreateIndex
CREATE INDEX "ContaPagar_fornecedorId_idx" ON "ContaPagar"("fornecedorId");

-- CreateIndex
CREATE INDEX "ContaPagar_status_idx" ON "ContaPagar"("status");

-- CreateIndex
CREATE INDEX "ContaPagar_dataVencimento_idx" ON "ContaPagar"("dataVencimento");

-- CreateIndex
CREATE INDEX "LancamentoCaixa_tipo_idx" ON "LancamentoCaixa"("tipo");

-- CreateIndex
CREATE INDEX "LancamentoCaixa_dataLancamento_idx" ON "LancamentoCaixa"("dataLancamento");

-- AddForeignKey
ALTER TABLE "EstoqueItem" ADD CONSTRAINT "EstoqueItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_pedidoVendaItemId_fkey" FOREIGN KEY ("pedidoVendaItemId") REFERENCES "PedidoVendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoVendaItem" ADD CONSTRAINT "PedidoVendaItem_pedidoVendaId_fkey" FOREIGN KEY ("pedidoVendaId") REFERENCES "PedidoVenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoVendaItem" ADD CONSTRAINT "PedidoVendaItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_pedidoVendaId_fkey" FOREIGN KEY ("pedidoVendaId") REFERENCES "PedidoVenda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoCaixa" ADD CONSTRAINT "LancamentoCaixa_contaReceberId_fkey" FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoCaixa" ADD CONSTRAINT "LancamentoCaixa_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
