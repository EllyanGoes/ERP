Loaded Prisma config from prisma.config.ts.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PerfilUsuario" AS ENUM ('ADMIN', 'USUARIO');

-- CreateEnum
CREATE TYPE "ProcessoAprovacao" AS ENUM ('SOLICITACAO_COMPRAS', 'PEDIDO_VENDA', 'CONTRATO', 'DESPESA', 'GERAL');

-- CreateEnum
CREATE TYPE "StatusAprovacao" AS ENUM ('PENDENTE', 'APROVADO', 'REPROVADO');

-- CreateEnum
CREATE TYPE "StatusCliente" AS ENUM ('ATIVO', 'INATIVO', 'PROSPECTO');

-- CreateEnum
CREATE TYPE "StatusConferenciaCompra" AS ENUM ('PENDENTE', 'EM_CONFERENCIA', 'CONCLUIDA', 'DIVERGENCIA');

-- CreateEnum
CREATE TYPE "StatusConta" AS ENUM ('ABERTA', 'PAGA', 'VENCIDA', 'CANCELADA', 'PARCIAL');

-- CreateEnum
CREATE TYPE "StatusCotacaoCompra" AS ENUM ('PENDENTE', 'EM_ANALISE', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "StatusNecessidade" AS ENUM ('RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADA', 'REJEITADA', 'EM_COTACAO', 'TOTALMENTE_ATENDIDA', 'PARCIALMENTE_ATENDIDA');

-- CreateEnum
CREATE TYPE "StatusPedidoCompra" AS ENUM ('AGUARDANDO_PAGAMENTO', 'EM_TRANSITO', 'CONFIRMADO', 'CANCELADO', 'RASCUNHO', 'ENVIADO', 'RECEBIDO');

-- CreateEnum
CREATE TYPE "StatusMinuta" AS ENUM ('PENDENTE', 'SAIU_PARA_ENTREGA', 'ENTREGUE', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusPedidoVenda" AS ENUM ('ORCAMENTO', 'CONFIRMADO', 'EM_AGENDAMENTO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusRespostaFornecedor" AS ENUM ('AGUARDANDO', 'RESPONDIDA', 'RECUSADA');

-- CreateEnum
CREATE TYPE "TipoFormaPagamento" AS ENUM ('DINHEIRO', 'PIX', 'TRANSFERENCIA', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'CHEQUE', 'OUTROS');

-- CreateEnum
CREATE TYPE "TipoItem" AS ENUM ('PRODUTO', 'SERVICO', 'MATERIA_PRIMA');

-- CreateEnum
CREATE TYPE "TipoLancamentoCaixa" AS ENUM ('RECEITA', 'DESPESA', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "TipoMovimentacaoEstoque" AS ENUM ('ENTRADA', 'SAIDA', 'AJUSTE', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('FISICA', 'JURIDICA');

-- CreateEnum
CREATE TYPE "UnidadeMedida" AS ENUM ('UN', 'KG', 'LT', 'MT', 'CX', 'PC', 'HR');

-- CreateEnum
CREATE TYPE "TipoMovimentacaoComodato" AS ENUM ('SAIDA', 'RETORNO');

-- CreateEnum
CREATE TYPE "OrigemMovimentacaoComodato" AS ENUM ('MANUAL', 'AUTOMATICO');

-- CreateEnum
CREATE TYPE "TipoRequisicaoMaterial" AS ENUM ('REQUISICAO', 'DEVOLUCAO');

-- CreateEnum
CREATE TYPE "StatusRequisicaoMaterial" AS ENUM ('RASCUNHO', 'ABERTA', 'ATENDIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoInventarioMaterial" AS ENUM ('TOTAL', 'PARCIAL', 'CICLICO');

-- CreateEnum
CREATE TYPE "StatusInventarioMaterial" AS ENUM ('RASCUNHO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoSupportTicket" AS ENUM ('MELHORIA', 'BUG', 'DUVIDA');

-- CreateEnum
CREATE TYPE "StatusSupportTicket" AS ENUM ('ABERTO', 'EM_ANALISE', 'RESOLVIDO', 'FECHADO');

-- CreateEnum
CREATE TYPE "PrioridadeTicket" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateTable
CREATE TABLE "AnexoCotacaoFornecedor" (
    "id" TEXT NOT NULL,
    "cotacaoFornecedorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnexoCotacaoFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AprovacaoEtapa" (
    "id" TEXT NOT NULL,
    "fluxoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "nome" TEXT,
    "valorMin" DECIMAL(15,2),
    "valorMax" DECIMAL(15,2),
    "aprovadorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "colaboradorId" TEXT,

    CONSTRAINT "AprovacaoEtapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AprovacaoFluxo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processo" "ProcessoAprovacao" NOT NULL DEFAULT 'SOLICITACAO_COMPRAS',

    CONSTRAINT "AprovacaoFluxo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AprovacaoSC" (
    "id" TEXT NOT NULL,
    "necessidadeId" TEXT NOT NULL,
    "etapaOrdem" INTEGER NOT NULL,
    "etapaNome" TEXT,
    "aprovadorId" TEXT NOT NULL,
    "status" "StatusAprovacao" NOT NULL DEFAULT 'PENDENTE',
    "observacao" TEXT,
    "respondidoEm" TIMESTAMP(3),
    "waMsgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fluxoId" TEXT,

    CONSTRAINT "AprovacaoSC_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentroCusto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "grupoCentroCustoId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentroCusto_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Colaborador" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT,
    "rg" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "telegramChatId" TEXT,
    "cargo" TEXT,
    "setorId" TEXT,
    "dataAdmissao" TIMESTAMP(3),
    "dataDemissao" TIMESTAMP(3),
    "usuarioId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setor" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setor_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "ConferenciaCompra" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "pedidoId" TEXT,
    "status" "StatusConferenciaCompra" NOT NULL DEFAULT 'PENDENTE',
    "dataConferencia" TIMESTAMP(3),
    "responsavel" TEXT,
    "observacoes" TEXT,
    "tipoNota" TEXT DEFAULT 'NORMAL',
    "numeroNF" TEXT,
    "serie" TEXT,
    "dtEmissao" TIMESTAMP(3),
    "ufOrigem" TEXT,
    "espDocumento" TEXT DEFAULT 'SPED',
    "fornecedorId" TEXT,
    "localEstoqueId" TEXT,
    "modoLocalEstoque" TEXT DEFAULT 'POR_ITEM',
    "frete" DECIMAL(15,2),
    "tipoFrete" TEXT,
    "seguro" DECIMAL(15,2),
    "despesas" DECIMAL(15,2),
    "desconto" DECIMAL(15,2),
    "vrTotal" DECIMAL(15,2),
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
    "localEstoqueId" TEXT,
    "vlrUnitario" DECIMAL(15,2),
    "vlrTotal" DECIMAL(15,2),
    "vlrIPI" DECIMAL(15,2),
    "vlrICMS" DECIMAL(15,2),
    "tipoEntrada" TEXT,
    "codFiscal" TEXT,
    "tpOper" TEXT,
    "desconto" DECIMAL(15,4),

    CONSTRAINT "ConferenciaCompraItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracao" (
    "chave" TEXT NOT NULL,
    "valor" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracao_pkey" PRIMARY KEY ("chave")
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
CREATE TABLE "CotacaoCompra" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "necessidadeId" TEXT,
    "status" "StatusCotacaoCompra" NOT NULL DEFAULT 'PENDENTE',
    "dataLimiteResposta" TIMESTAMP(3),
    "observacoes" TEXT,
    "aprovadoPor" TEXT,
    "dataAprovacao" TIMESTAMP(3),
    "fornecedorVencedorId" TEXT,
    "motivoReprovacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "infoEntrega" TEXT,
    "nome" TEXT,

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
    "desconto" DECIMAL(5,2),
    "despesas" DECIMAL(15,2),
    "frete" DECIMAL(15,2),
    "seguro" DECIMAL(15,2),
    "tipoFrete" TEXT,
    "vrDesconto" DECIMAL(15,2),

    CONSTRAINT "CotacaoFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoFornecedorHistorico" (
    "id" TEXT NOT NULL,
    "cotacaoFornecedorId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "totalCalculado" DECIMAL(15,2),
    "frete" DECIMAL(15,2),
    "tipoFrete" TEXT,
    "desconto" DECIMAL(5,2),
    "vrDesconto" DECIMAL(15,2),
    "despesas" DECIMAL(15,2),
    "seguro" DECIMAL(15,2),
    "condicoesPagamento" TEXT,
    "prazoEntregaDias" INTEGER,
    "observacao" TEXT,
    "itensSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CotacaoFornecedorHistorico_pkey" PRIMARY KEY ("id")
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
    "qtdDisponivel" DECIMAL(15,3),
    "situacao" TEXT DEFAULT 'CONSIDERA',
    "desconto" DECIMAL(15,4),

    CONSTRAINT "CotacaoFornecedorItem_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "EnderecoEstoque" (
    "id" TEXT NOT NULL,
    "localEstoqueId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnderecoEstoque_pkey" PRIMARY KEY ("id")
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
    "localEstoqueId" TEXT,

    CONSTRAINT "EstoqueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Filial" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT,
    "ie" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "celular" TEXT,
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

    CONSTRAINT "Filial_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" TEXT NOT NULL,
    "tipoPessoa" "TipoPessoa" NOT NULL DEFAULT 'JURIDICA',
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cpfCnpj" TEXT,
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
    "celular" TEXT,
    "contato" TEXT,
    "observacoes" TEXT,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FornecedorContato" (
    "id" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT,
    "telefone" TEXT,
    "ramal" TEXT,
    "email" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FornecedorContato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoCentroCusto" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrupoCentroCusto_pkey" PRIMARY KEY ("id")
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
    "favorito" BOOLEAN NOT NULL DEFAULT false,
    "vendavel" BOOLEAN NOT NULL DEFAULT false,
    "comodato" BOOLEAN NOT NULL DEFAULT false,
    "estoqueMinimo" DECIMAL(15,3),
    "estoqueMaximo" DECIMAL(15,3),
    "pontoReposicao" DECIMAL(15,3),
    "leadTimeDias" INTEGER,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tipoProdutoId" TEXT,
    "unidadeId" TEXT,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemUnidade" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "fatorConversao" DECIMAL(15,6),
    "isPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "baseUnidadeId" TEXT,

    CONSTRAINT "ItemUnidade_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "LocalEstoque" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "filialId" TEXT,

    CONSTRAINT "LocalEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoteMovimentacao" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" "TipoMovimentacaoEstoque" NOT NULL,
    "documento" TEXT,
    "observacoes" TEXT,
    "dataMovimentacao" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoteMovimentacao_pkey" PRIMARY KEY ("id")
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
    "conferenciaItemId" TEXT,
    "localEstoqueId" TEXT,
    "loteId" TEXT,
    "valorUnitario" DECIMAL(15,4),
    "unidadeId" TEXT,

    CONSTRAINT "MovimentacaoEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentacaoComodato" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tipo" "TipoMovimentacaoComodato" NOT NULL,
    "quantidade" DECIMAL(15,3) NOT NULL,
    "valorUnitario" DECIMAL(15,2) NOT NULL,
    "origem" "OrigemMovimentacaoComodato" NOT NULL DEFAULT 'MANUAL',
    "pedidoVendaId" TEXT,
    "minutaId" TEXT,
    "documento" TEXT,
    "observacoes" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentacaoComodato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NecessidadeCompra" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "status" "StatusNecessidade" NOT NULL DEFAULT 'RASCUNHO',
    "solicitante" TEXT,
    "colaboradorId" TEXT,
    "setorId" TEXT,
    "justificativa" TEXT,
    "dataNecessidade" TIMESTAMP(3),
    "observacoes" TEXT,
    "aprovadoPor" TEXT,
    "dataAprovacao" TIMESTAMP(3),
    "motivoReprovacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoria" TEXT,
    "centroCustoId" TEXT,
    "classificacaoAuxiliar" TEXT,
    "filialId" TEXT,
    "localEstoqueId" TEXT,
    "motivo" TEXT,
    "prioridade" INTEGER NOT NULL DEFAULT 3,
    "projeto" TEXT,
    "tipoCompra" TEXT,

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
    "unidade" TEXT,

    CONSTRAINT "NecessidadeCompraItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoCompra" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "cotacaoId" TEXT,
    "necessidadeId" TEXT,
    "fornecedorId" TEXT NOT NULL,
    "status" "StatusPedidoCompra" NOT NULL DEFAULT 'RASCUNHO',
    "valorTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "dataEntregaPrevista" TIMESTAMP(3),
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "condicoesPagamento" TEXT,
    "contato" TEXT,
    "desconto" DECIMAL(5,2),
    "despesas" DECIMAL(15,2),
    "email" TEXT,
    "frete" DECIMAL(15,2),
    "seguro" DECIMAL(15,2),
    "tipoFrete" TEXT,
    "vrDesconto" DECIMAL(15,2),
    "descricao" TEXT,

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
    "situacao" TEXT DEFAULT 'CONSIDERA',
    "desconto" DECIMAL(15,4),

    CONSTRAINT "PedidoCompraItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoVenda" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tabelaPrecoId" TEXT,
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
    "descontoPct" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "valorDesconto" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "PedidoVendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerfilAcesso" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "permissoes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerfilAcesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permissao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,

    CONSTRAINT "Permissao_pkey" PRIMARY KEY ("id")
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
    "classificacao" TEXT,
    "dataUltimaCompra" TIMESTAMP(3),
    "especificacao" TEXT,
    "indiceFinanceiro" TEXT,
    "percentual" DECIMAL(5,2),
    "qtdeUltimaCompra" DECIMAL(15,3),
    "tempoResuprimento" INTEGER,
    "ultimaQtdeDev" DECIMAL(15,3),
    "unidade" TEXT,

    CONSTRAINT "ProdutoFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Motorista" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT,
    "cnh" TEXT,
    "telefone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Motorista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Minuta" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "pedidoVendaId" TEXT NOT NULL,
    "localEstoqueId" TEXT,
    "motoristaId" TEXT,
    "status" "StatusMinuta" NOT NULL DEFAULT 'PENDENTE',
    "dataEmissao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataEntrega" TIMESTAMP(3),
    "placa" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Minuta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinutaItem" (
    "id" TEXT NOT NULL,
    "minutaId" TEXT NOT NULL,
    "pedidoVendaItemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidade" DECIMAL(15,3) NOT NULL,
    "quantidadeConvertida" DECIMAL(15,3),
    "unidadeId" TEXT,

    CONSTRAINT "MinutaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequencia" (
    "prefixo" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Sequencia_pkey" PRIMARY KEY ("prefixo")
);

-- CreateTable
CREATE TABLE "TabelaPreco" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "dataInicial" TIMESTAMP(3) NOT NULL,
    "dataFinal" TIMESTAMP(3),
    "condicaoPagamento" TEXT,
    "tipoHorario" TEXT NOT NULL DEFAULT 'UNICO',
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ecommerce" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TabelaPreco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TabelaPrecoItem" (
    "id" TEXT NOT NULL,
    "tabelaPrecoId" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "itemId" TEXT,
    "grupo" TEXT,
    "precoBase" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "precoVenda" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "vlrDesconto" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "fator" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "tipoOperacao" TEXT,
    "faixa" DECIMAL(15,2),
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TabelaPrecoItem_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "UnidadeConversao" (
    "id" TEXT NOT NULL,
    "unidadeOrigemId" TEXT NOT NULL,
    "unidadeDestinoId" TEXT NOT NULL,
    "fator" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnidadeConversao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "perfil" "PerfilUsuario" NOT NULL DEFAULT 'USUARIO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "perfilAcessoId" TEXT,
    "telefone" TEXT,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisicaoMaterial" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" "TipoRequisicaoMaterial" NOT NULL DEFAULT 'REQUISICAO',
    "status" "StatusRequisicaoMaterial" NOT NULL DEFAULT 'RASCUNHO',
    "localEstoqueId" TEXT NOT NULL,
    "colaboradorId" TEXT,
    "setorId" TEXT,
    "almoxarifeId" TEXT,
    "os" TEXT,
    "centroCustoId" TEXT,
    "contaContabil" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequisicaoMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisicaoMaterialItem" (
    "id" TEXT NOT NULL,
    "requisicaoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidade" DECIMAL(15,3) NOT NULL,
    "unidade" TEXT,
    "localizacao" TEXT,
    "centroCustoId" TEXT,
    "contaContabil" TEXT,
    "os" TEXT,
    "requisicaoRef" TEXT,

    CONSTRAINT "RequisicaoMaterialItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioMaterial" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "localEstoqueId" TEXT NOT NULL,
    "colaboradorId" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "tipo" "TipoInventarioMaterial" NOT NULL DEFAULT 'TOTAL',
    "status" "StatusInventarioMaterial" NOT NULL DEFAULT 'RASCUNHO',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventarioMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioMaterialItem" (
    "id" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "localizacao" TEXT,
    "saldoSistema" DECIMAL(15,3) NOT NULL,
    "saldoFisico" DECIMAL(15,3),
    "diferenca" DECIMAL(15,3),
    "custoUnitario" DECIMAL(15,2),
    "fornecedorId" TEXT,

    CONSTRAINT "InventarioMaterialItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoSupportTicket" NOT NULL DEFAULT 'MELHORIA',
    "status" "StatusSupportTicket" NOT NULL DEFAULT 'ABERTO',
    "prioridade" "PrioridadeTicket" NOT NULL DEFAULT 'MEDIA',
    "imagemUrl" TEXT,
    "imagemNome" TEXT,
    "resposta" TEXT,
    "usuarioId" TEXT NOT NULL,
    "respondidoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ColaboradorToFilial" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ColaboradorToFilial_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "CentroCusto_codigo_key" ON "CentroCusto"("codigo");

-- CreateIndex
CREATE INDEX "CentroCusto_grupoCentroCustoId_idx" ON "CentroCusto"("grupoCentroCustoId");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_cpfCnpj_key" ON "Cliente"("cpfCnpj");

-- CreateIndex
CREATE INDEX "Cliente_cpfCnpj_idx" ON "Cliente"("cpfCnpj");

-- CreateIndex
CREATE INDEX "Cliente_status_idx" ON "Cliente"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Colaborador_cpf_key" ON "Colaborador"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Colaborador_usuarioId_key" ON "Colaborador"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "ConferenciaCompra_numero_key" ON "ConferenciaCompra"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "ConferenciaCompra_pedidoId_key" ON "ConferenciaCompra"("pedidoId");

-- CreateIndex
CREATE INDEX "ConferenciaCompra_status_idx" ON "ConferenciaCompra"("status");

-- CreateIndex
CREATE INDEX "ConferenciaCompra_fornecedorId_idx" ON "ConferenciaCompra"("fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "ContaPagar_numero_key" ON "ContaPagar"("numero");

-- CreateIndex
CREATE INDEX "ContaPagar_dataVencimento_idx" ON "ContaPagar"("dataVencimento");

-- CreateIndex
CREATE INDEX "ContaPagar_fornecedorId_idx" ON "ContaPagar"("fornecedorId");

-- CreateIndex
CREATE INDEX "ContaPagar_status_idx" ON "ContaPagar"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ContaReceber_numero_key" ON "ContaReceber"("numero");

-- CreateIndex
CREATE INDEX "ContaReceber_clienteId_idx" ON "ContaReceber"("clienteId");

-- CreateIndex
CREATE INDEX "ContaReceber_dataVencimento_idx" ON "ContaReceber"("dataVencimento");

-- CreateIndex
CREATE INDEX "ContaReceber_status_idx" ON "ContaReceber"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CotacaoCompra_numero_key" ON "CotacaoCompra"("numero");

-- CreateIndex
CREATE INDEX "CotacaoCompra_status_idx" ON "CotacaoCompra"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CotacaoFornecedor_cotacaoId_fornecedorId_key" ON "CotacaoFornecedor"("cotacaoId", "fornecedorId");

-- CreateIndex
CREATE INDEX "CotacaoFornecedorHistorico_cotacaoFornecedorId_idx" ON "CotacaoFornecedorHistorico"("cotacaoFornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_cnpj_key" ON "Empresa"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "EnderecoEstoque_localEstoqueId_codigo_key" ON "EnderecoEstoque"("localEstoqueId", "codigo");

-- CreateIndex
CREATE INDEX "EstoqueItem_itemId_idx" ON "EstoqueItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "EstoqueItem_itemId_localEstoqueId_key" ON "EstoqueItem"("itemId", "localEstoqueId");

-- CreateIndex
CREATE UNIQUE INDEX "Filial_cnpj_key" ON "Filial"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_cpfCnpj_key" ON "Fornecedor"("cpfCnpj");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoCentroCusto_nome_key" ON "GrupoCentroCusto"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Item_codigo_key" ON "Item"("codigo");

-- CreateIndex
CREATE INDEX "Item_codigo_idx" ON "Item"("codigo");

-- CreateIndex
CREATE INDEX "Item_tipo_idx" ON "Item"("tipo");

-- CreateIndex
CREATE INDEX "ItemUnidade_itemId_idx" ON "ItemUnidade"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemUnidade_itemId_unidadeId_key" ON "ItemUnidade"("itemId", "unidadeId");

-- CreateIndex
CREATE INDEX "LancamentoCaixa_dataLancamento_idx" ON "LancamentoCaixa"("dataLancamento");

-- CreateIndex
CREATE INDEX "LancamentoCaixa_tipo_idx" ON "LancamentoCaixa"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "LoteMovimentacao_numero_key" ON "LoteMovimentacao"("numero");

-- CreateIndex
CREATE INDEX "MovimentacaoEstoque_createdAt_idx" ON "MovimentacaoEstoque"("createdAt");

-- CreateIndex
CREATE INDEX "MovimentacaoEstoque_itemId_idx" ON "MovimentacaoEstoque"("itemId");

-- CreateIndex
CREATE INDEX "MovimentacaoEstoque_loteId_idx" ON "MovimentacaoEstoque"("loteId");

-- CreateIndex
CREATE INDEX "MovimentacaoEstoque_tipo_idx" ON "MovimentacaoEstoque"("tipo");

-- CreateIndex
CREATE INDEX "MovimentacaoComodato_clienteId_idx" ON "MovimentacaoComodato"("clienteId");

-- CreateIndex
CREATE INDEX "MovimentacaoComodato_itemId_idx" ON "MovimentacaoComodato"("itemId");

-- CreateIndex
CREATE INDEX "MovimentacaoComodato_data_idx" ON "MovimentacaoComodato"("data");

-- CreateIndex
CREATE UNIQUE INDEX "NecessidadeCompra_numero_key" ON "NecessidadeCompra"("numero");

-- CreateIndex
CREATE INDEX "NecessidadeCompra_status_idx" ON "NecessidadeCompra"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoCompra_numero_key" ON "PedidoCompra"("numero");

-- CreateIndex
CREATE INDEX "PedidoCompra_fornecedorId_idx" ON "PedidoCompra"("fornecedorId");

-- CreateIndex
CREATE INDEX "PedidoCompra_status_idx" ON "PedidoCompra"("status");

-- CreateIndex
CREATE INDEX "PedidoCompra_necessidadeId_idx" ON "PedidoCompra"("necessidadeId");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoVenda_numero_key" ON "PedidoVenda"("numero");

-- CreateIndex
CREATE INDEX "PedidoVenda_clienteId_idx" ON "PedidoVenda"("clienteId");

-- CreateIndex
CREATE INDEX "PedidoVenda_dataEmissao_idx" ON "PedidoVenda"("dataEmissao");

-- CreateIndex
CREATE INDEX "PedidoVenda_status_idx" ON "PedidoVenda"("status");

-- CreateIndex
CREATE INDEX "PedidoVendaItem_itemId_idx" ON "PedidoVendaItem"("itemId");

-- CreateIndex
CREATE INDEX "PedidoVendaItem_pedidoVendaId_idx" ON "PedidoVendaItem"("pedidoVendaId");

-- CreateIndex
CREATE UNIQUE INDEX "PerfilAcesso_nome_key" ON "PerfilAcesso"("nome");

-- CreateIndex
CREATE INDEX "Permissao_usuarioId_idx" ON "Permissao"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Permissao_usuarioId_modulo_key" ON "Permissao"("usuarioId", "modulo");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoFornecedor_itemId_fornecedorId_key" ON "ProdutoFornecedor"("itemId", "fornecedorId");

-- CreateIndex
CREATE INDEX "Motorista_ativo_idx" ON "Motorista"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "Minuta_numero_key" ON "Minuta"("numero");

-- CreateIndex
CREATE INDEX "Minuta_pedidoVendaId_idx" ON "Minuta"("pedidoVendaId");

-- CreateIndex
CREATE INDEX "Minuta_status_idx" ON "Minuta"("status");

-- CreateIndex
CREATE INDEX "Minuta_motoristaId_idx" ON "Minuta"("motoristaId");

-- CreateIndex
CREATE INDEX "MinutaItem_minutaId_idx" ON "MinutaItem"("minutaId");

-- CreateIndex
CREATE INDEX "MinutaItem_pedidoVendaItemId_idx" ON "MinutaItem"("pedidoVendaItemId");

-- CreateIndex
CREATE UNIQUE INDEX "TabelaPreco_codigo_key" ON "TabelaPreco"("codigo");

-- CreateIndex
CREATE INDEX "TabelaPreco_ativa_idx" ON "TabelaPreco"("ativa");

-- CreateIndex
CREATE INDEX "TabelaPrecoItem_tabelaPrecoId_idx" ON "TabelaPrecoItem"("tabelaPrecoId");

-- CreateIndex
CREATE INDEX "TabelaPrecoItem_itemId_idx" ON "TabelaPrecoItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Unidade_sigla_key" ON "Unidade"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "UnidadeConversao_unidadeOrigemId_unidadeDestinoId_key" ON "UnidadeConversao"("unidadeOrigemId", "unidadeDestinoId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RequisicaoMaterial_numero_key" ON "RequisicaoMaterial"("numero");

-- CreateIndex
CREATE INDEX "RequisicaoMaterial_status_idx" ON "RequisicaoMaterial"("status");

-- CreateIndex
CREATE INDEX "RequisicaoMaterial_localEstoqueId_idx" ON "RequisicaoMaterial"("localEstoqueId");

-- CreateIndex
CREATE INDEX "RequisicaoMaterialItem_requisicaoId_idx" ON "RequisicaoMaterialItem"("requisicaoId");

-- CreateIndex
CREATE UNIQUE INDEX "InventarioMaterial_numero_key" ON "InventarioMaterial"("numero");

-- CreateIndex
CREATE INDEX "InventarioMaterial_status_idx" ON "InventarioMaterial"("status");

-- CreateIndex
CREATE INDEX "InventarioMaterial_localEstoqueId_idx" ON "InventarioMaterial"("localEstoqueId");

-- CreateIndex
CREATE INDEX "InventarioMaterialItem_inventarioId_idx" ON "InventarioMaterialItem"("inventarioId");

-- CreateIndex
CREATE INDEX "InventarioMaterialItem_fornecedorId_idx" ON "InventarioMaterialItem"("fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_numero_key" ON "SupportTicket"("numero");

-- CreateIndex
CREATE INDEX "SupportTicket_usuarioId_idx" ON "SupportTicket"("usuarioId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "_ColaboradorToFilial_B_index" ON "_ColaboradorToFilial"("B");

-- AddForeignKey
ALTER TABLE "AnexoCotacaoFornecedor" ADD CONSTRAINT "AnexoCotacaoFornecedor_cotacaoFornecedorId_fkey" FOREIGN KEY ("cotacaoFornecedorId") REFERENCES "CotacaoFornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AprovacaoEtapa" ADD CONSTRAINT "AprovacaoEtapa_aprovadorId_fkey" FOREIGN KEY ("aprovadorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AprovacaoEtapa" ADD CONSTRAINT "AprovacaoEtapa_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AprovacaoEtapa" ADD CONSTRAINT "AprovacaoEtapa_fluxoId_fkey" FOREIGN KEY ("fluxoId") REFERENCES "AprovacaoFluxo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AprovacaoSC" ADD CONSTRAINT "AprovacaoSC_aprovadorId_fkey" FOREIGN KEY ("aprovadorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AprovacaoSC" ADD CONSTRAINT "AprovacaoSC_fluxoId_fkey" FOREIGN KEY ("fluxoId") REFERENCES "AprovacaoFluxo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AprovacaoSC" ADD CONSTRAINT "AprovacaoSC_necessidadeId_fkey" FOREIGN KEY ("necessidadeId") REFERENCES "NecessidadeCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentroCusto" ADD CONSTRAINT "CentroCusto_grupoCentroCustoId_fkey" FOREIGN KEY ("grupoCentroCustoId") REFERENCES "GrupoCentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenciaCompra" ADD CONSTRAINT "ConferenciaCompra_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenciaCompra" ADD CONSTRAINT "ConferenciaCompra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenciaCompra" ADD CONSTRAINT "ConferenciaCompra_localEstoqueId_fkey" FOREIGN KEY ("localEstoqueId") REFERENCES "LocalEstoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenciaCompraItem" ADD CONSTRAINT "ConferenciaCompraItem_conferenciaId_fkey" FOREIGN KEY ("conferenciaId") REFERENCES "ConferenciaCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenciaCompraItem" ADD CONSTRAINT "ConferenciaCompraItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConferenciaCompraItem" ADD CONSTRAINT "ConferenciaCompraItem_localEstoqueId_fkey" FOREIGN KEY ("localEstoqueId") REFERENCES "LocalEstoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_pedidoVendaId_fkey" FOREIGN KEY ("pedidoVendaId") REFERENCES "PedidoVenda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoCompra" ADD CONSTRAINT "CotacaoCompra_necessidadeId_fkey" FOREIGN KEY ("necessidadeId") REFERENCES "NecessidadeCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedor" ADD CONSTRAINT "CotacaoFornecedor_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "CotacaoCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedor" ADD CONSTRAINT "CotacaoFornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedorHistorico" ADD CONSTRAINT "CotacaoFornecedorHistorico_cotacaoFornecedorId_fkey" FOREIGN KEY ("cotacaoFornecedorId") REFERENCES "CotacaoFornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedorItem" ADD CONSTRAINT "CotacaoFornecedorItem_cotacaoFornecedorId_fkey" FOREIGN KEY ("cotacaoFornecedorId") REFERENCES "CotacaoFornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedorItem" ADD CONSTRAINT "CotacaoFornecedorItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnderecoEstoque" ADD CONSTRAINT "EnderecoEstoque_localEstoqueId_fkey" FOREIGN KEY ("localEstoqueId") REFERENCES "LocalEstoque"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueItem" ADD CONSTRAINT "EstoqueItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueItem" ADD CONSTRAINT "EstoqueItem_localEstoqueId_fkey" FOREIGN KEY ("localEstoqueId") REFERENCES "LocalEstoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FornecedorContato" ADD CONSTRAINT "FornecedorContato_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_tipoProdutoId_fkey" FOREIGN KEY ("tipoProdutoId") REFERENCES "TipoProduto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemUnidade" ADD CONSTRAINT "ItemUnidade_baseUnidadeId_fkey" FOREIGN KEY ("baseUnidadeId") REFERENCES "Unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemUnidade" ADD CONSTRAINT "ItemUnidade_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemUnidade" ADD CONSTRAINT "ItemUnidade_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoCaixa" ADD CONSTRAINT "LancamentoCaixa_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoCaixa" ADD CONSTRAINT "LancamentoCaixa_contaReceberId_fkey" FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalEstoque" ADD CONSTRAINT "LocalEstoque_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "Filial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_conferenciaItemId_fkey" FOREIGN KEY ("conferenciaItemId") REFERENCES "ConferenciaCompraItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_localEstoqueId_fkey" FOREIGN KEY ("localEstoqueId") REFERENCES "LocalEstoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteMovimentacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_pedidoVendaItemId_fkey" FOREIGN KEY ("pedidoVendaItemId") REFERENCES "PedidoVendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoComodato" ADD CONSTRAINT "MovimentacaoComodato_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoComodato" ADD CONSTRAINT "MovimentacaoComodato_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NecessidadeCompra" ADD CONSTRAINT "NecessidadeCompra_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NecessidadeCompra" ADD CONSTRAINT "NecessidadeCompra_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NecessidadeCompra" ADD CONSTRAINT "NecessidadeCompra_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "Filial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NecessidadeCompra" ADD CONSTRAINT "NecessidadeCompra_localEstoqueId_fkey" FOREIGN KEY ("localEstoqueId") REFERENCES "LocalEstoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NecessidadeCompra" ADD CONSTRAINT "NecessidadeCompra_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NecessidadeCompraItem" ADD CONSTRAINT "NecessidadeCompraItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NecessidadeCompraItem" ADD CONSTRAINT "NecessidadeCompraItem_necessidadeId_fkey" FOREIGN KEY ("necessidadeId") REFERENCES "NecessidadeCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "CotacaoCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_necessidadeId_fkey" FOREIGN KEY ("necessidadeId") REFERENCES "NecessidadeCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompraItem" ADD CONSTRAINT "PedidoCompraItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompraItem" ADD CONSTRAINT "PedidoCompraItem_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_tabelaPrecoId_fkey" FOREIGN KEY ("tabelaPrecoId") REFERENCES "TabelaPreco"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoVendaItem" ADD CONSTRAINT "PedidoVendaItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoVendaItem" ADD CONSTRAINT "PedidoVendaItem_pedidoVendaId_fkey" FOREIGN KEY ("pedidoVendaId") REFERENCES "PedidoVenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permissao" ADD CONSTRAINT "Permissao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoFornecedor" ADD CONSTRAINT "ProdutoFornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoFornecedor" ADD CONSTRAINT "ProdutoFornecedor_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Minuta" ADD CONSTRAINT "Minuta_pedidoVendaId_fkey" FOREIGN KEY ("pedidoVendaId") REFERENCES "PedidoVenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Minuta" ADD CONSTRAINT "Minuta_localEstoqueId_fkey" FOREIGN KEY ("localEstoqueId") REFERENCES "LocalEstoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Minuta" ADD CONSTRAINT "Minuta_motoristaId_fkey" FOREIGN KEY ("motoristaId") REFERENCES "Motorista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinutaItem" ADD CONSTRAINT "MinutaItem_minutaId_fkey" FOREIGN KEY ("minutaId") REFERENCES "Minuta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinutaItem" ADD CONSTRAINT "MinutaItem_pedidoVendaItemId_fkey" FOREIGN KEY ("pedidoVendaItemId") REFERENCES "PedidoVendaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinutaItem" ADD CONSTRAINT "MinutaItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinutaItem" ADD CONSTRAINT "MinutaItem_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabelaPrecoItem" ADD CONSTRAINT "TabelaPrecoItem_tabelaPrecoId_fkey" FOREIGN KEY ("tabelaPrecoId") REFERENCES "TabelaPreco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabelaPrecoItem" ADD CONSTRAINT "TabelaPrecoItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnidadeConversao" ADD CONSTRAINT "UnidadeConversao_unidadeDestinoId_fkey" FOREIGN KEY ("unidadeDestinoId") REFERENCES "Unidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnidadeConversao" ADD CONSTRAINT "UnidadeConversao_unidadeOrigemId_fkey" FOREIGN KEY ("unidadeOrigemId") REFERENCES "Unidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_perfilAcessoId_fkey" FOREIGN KEY ("perfilAcessoId") REFERENCES "PerfilAcesso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisicaoMaterial" ADD CONSTRAINT "RequisicaoMaterial_localEstoqueId_fkey" FOREIGN KEY ("localEstoqueId") REFERENCES "LocalEstoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisicaoMaterial" ADD CONSTRAINT "RequisicaoMaterial_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisicaoMaterial" ADD CONSTRAINT "RequisicaoMaterial_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisicaoMaterial" ADD CONSTRAINT "RequisicaoMaterial_almoxarifeId_fkey" FOREIGN KEY ("almoxarifeId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisicaoMaterial" ADD CONSTRAINT "RequisicaoMaterial_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisicaoMaterialItem" ADD CONSTRAINT "RequisicaoMaterialItem_requisicaoId_fkey" FOREIGN KEY ("requisicaoId") REFERENCES "RequisicaoMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisicaoMaterialItem" ADD CONSTRAINT "RequisicaoMaterialItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisicaoMaterialItem" ADD CONSTRAINT "RequisicaoMaterialItem_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioMaterial" ADD CONSTRAINT "InventarioMaterial_localEstoqueId_fkey" FOREIGN KEY ("localEstoqueId") REFERENCES "LocalEstoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioMaterial" ADD CONSTRAINT "InventarioMaterial_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioMaterialItem" ADD CONSTRAINT "InventarioMaterialItem_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "InventarioMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioMaterialItem" ADD CONSTRAINT "InventarioMaterialItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioMaterialItem" ADD CONSTRAINT "InventarioMaterialItem_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_respondidoPorId_fkey" FOREIGN KEY ("respondidoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ColaboradorToFilial" ADD CONSTRAINT "_ColaboradorToFilial_A_fkey" FOREIGN KEY ("A") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ColaboradorToFilial" ADD CONSTRAINT "_ColaboradorToFilial_B_fkey" FOREIGN KEY ("B") REFERENCES "Filial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

