import { PrismaClient, TipoPessoa, StatusCliente, TipoItem, UnidadeMedida, StatusPedidoVenda, StatusConta } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed...");

  // Empresa
  await prisma.empresa.upsert({
    where: { cnpj: "12.345.678/0001-90" },
    update: {},
    create: {
      cnpj: "12.345.678/0001-90",
      razaoSocial: "Tech Solutions Ltda",
      nomeFantasia: "TechSol",
      email: "contato@techsol.com.br",
      telefone: "(11) 3000-0000",
      logradouro: "Av. Paulista",
      numero: "1000",
      bairro: "Bela Vista",
      cidade: "São Paulo",
      estado: "SP",
      cep: "01310-100",
    },
  });

  // Clientes
  const c1 = await prisma.cliente.upsert({
    where: { cpfCnpj: "11.222.333/0001-44" },
    update: {},
    create: {
      tipoPessoa: TipoPessoa.JURIDICA,
      cpfCnpj: "11.222.333/0001-44",
      razaoSocial: "Indústria ABC S.A.",
      nomeFantasia: "ABC Indústria",
      email: "compras@abc.com.br",
      telefone: "(11) 4000-1111",
      status: StatusCliente.ATIVO,
      logradouro: "Rua das Indústrias",
      numero: "500",
      bairro: "Distrito Industrial",
      cidade: "São Paulo",
      estado: "SP",
      cep: "04000-000",
    },
  });

  const c2 = await prisma.cliente.upsert({
    where: { cpfCnpj: "22.333.444/0001-55" },
    update: {},
    create: {
      tipoPessoa: TipoPessoa.JURIDICA,
      cpfCnpj: "22.333.444/0001-55",
      razaoSocial: "Comércio XYZ Ltda",
      nomeFantasia: "XYZ Comércio",
      email: "pedidos@xyz.com.br",
      telefone: "(11) 5000-2222",
      status: StatusCliente.ATIVO,
      logradouro: "Av. Comercial",
      numero: "200",
      bairro: "Centro",
      cidade: "Campinas",
      estado: "SP",
      cep: "13010-000",
    },
  });

  const c3 = await prisma.cliente.upsert({
    where: { cpfCnpj: "333.444.555-66" },
    update: {},
    create: {
      tipoPessoa: TipoPessoa.FISICA,
      cpfCnpj: "333.444.555-66",
      razaoSocial: "Carlos Pereira",
      nomeFantasia: "Carlos Pereira",
      email: "carlos@email.com",
      telefone: "(11) 99999-0000",
      status: StatusCliente.ATIVO,
      logradouro: "Rua dos Pinheiros",
      numero: "33",
      bairro: "Pinheiros",
      cidade: "São Paulo",
      estado: "SP",
      cep: "05422-000",
    },
  });

  // Fornecedores
  await prisma.fornecedor.upsert({
    where: { cpfCnpj: "55.666.777/0001-88" },
    update: {},
    create: {
      tipoPessoa: TipoPessoa.JURIDICA,
      cpfCnpj: "55.666.777/0001-88",
      razaoSocial: "Distribuidora Alfa Ltda",
      nomeFantasia: "Alfa Distribuidora",
      email: "vendas@alfa.com.br",
      telefone: "(11) 6000-3333",
      ativo: true,
      logradouro: "Rua dos Fornecedores",
      numero: "100",
      bairro: "Brás",
      cidade: "São Paulo",
      estado: "SP",
      cep: "03000-000",
    },
  });

  // Itens
  const items = [
    { codigo: "PROD-001", descricao: "Notebook Empresarial 15\"", tipo: TipoItem.PRODUTO, unidadeMedida: UnidadeMedida.UN, precoVenda: 3500.00, precoCusto: 2200.00, ncm: "8471.30.19", estoque: 15, estoqueMin: 3 },
    { codigo: "PROD-002", descricao: "Mouse Sem Fio", tipo: TipoItem.PRODUTO, unidadeMedida: UnidadeMedida.UN, precoVenda: 89.90, precoCusto: 35.00, ncm: "8471.60.53", estoque: 50, estoqueMin: 10 },
    { codigo: "PROD-003", descricao: "Teclado Mecânico USB", tipo: TipoItem.PRODUTO, unidadeMedida: UnidadeMedida.UN, precoVenda: 299.00, precoCusto: 120.00, ncm: "8471.60.52", estoque: 2, estoqueMin: 5 },
    { codigo: "PROD-004", descricao: "Monitor 24\" Full HD", tipo: TipoItem.PRODUTO, unidadeMedida: UnidadeMedida.UN, precoVenda: 1200.00, precoCusto: 750.00, ncm: "8528.52.20", estoque: 8, estoqueMin: 2 },
    { codigo: "PROD-005", descricao: "Headset USB com Microfone", tipo: TipoItem.PRODUTO, unidadeMedida: UnidadeMedida.UN, precoVenda: 199.00, precoCusto: 80.00, ncm: "8518.30.00", estoque: 0, estoqueMin: 5 },
    { codigo: "SERV-001", descricao: "Instalação e Configuração", tipo: TipoItem.SERVICO, unidadeMedida: UnidadeMedida.HR, precoVenda: 150.00, precoCusto: 0, ncm: null, estoque: 0, estoqueMin: 0 },
    { codigo: "SERV-002", descricao: "Suporte Técnico Mensal", tipo: TipoItem.SERVICO, unidadeMedida: UnidadeMedida.UN, precoVenda: 500.00, precoCusto: 0, ncm: null, estoque: 0, estoqueMin: 0 },
  ];

  const createdItems: Record<string, string> = {};

  for (const item of items) {
    const created = await prisma.item.upsert({
      where: { codigo: item.codigo },
      update: {},
      create: {
        codigo: item.codigo,
        descricao: item.descricao,
        tipo: item.tipo,
        unidadeMedida: item.unidadeMedida,
        precoVenda: item.precoVenda,
        precoCusto: item.precoCusto,
        ncm: item.ncm ?? undefined,
        ativo: true,
      },
    });
    createdItems[item.codigo] = created.id;

    // Create or update estoque
    const existingEstoque = await prisma.estoqueItem.findFirst({
      where: { itemId: created.id, localEstoqueId: null },
    });
    if (!existingEstoque) {
      await prisma.estoqueItem.create({
        data: {
          itemId: created.id,
          quantidadeAtual: item.estoque,
          quantidadeMin: item.estoqueMin,
        },
      });
    }
  }

  // Sequencias
  await prisma.sequencia.upsert({ where: { prefixo: "PV" }, update: {}, create: { prefixo: "PV", ultimo: 0 } });
  await prisma.sequencia.upsert({ where: { prefixo: "CR" }, update: {}, create: { prefixo: "CR", ultimo: 0 } });
  await prisma.sequencia.upsert({ where: { prefixo: "CP" }, update: {}, create: { prefixo: "CP", ultimo: 0 } });

  // Pedidos de Venda com sequencia
  const now = new Date();
  const year = now.getFullYear();

  // Pedido 1 — Entregue
  const seq1 = await prisma.sequencia.update({ where: { prefixo: "PV" }, data: { ultimo: { increment: 1 } } });
  const pv1 = await prisma.pedidoVenda.create({
    data: {
      numero: `PV-${year}-${String(seq1.ultimo).padStart(4, "0")}`,
      clienteId: c1.id,
      status: StatusPedidoVenda.ENTREGUE,
      valorTotal: 7389.80,
      observacoes: "Entregue sem intercorrências",
      createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      itens: {
        create: [
          { itemId: createdItems["PROD-001"], quantidade: 2, precoUnitario: 3500.00, valorTotal: 7000.00 },
          { itemId: createdItems["SERV-001"], quantidade: 2.6, precoUnitario: 150.00, valorTotal: 390.00 },
        ],
      },
    },
  });

  // CR para pedido 1 — Pago
  const seqCR1 = await prisma.sequencia.update({ where: { prefixo: "CR" }, data: { ultimo: { increment: 1 } } });
  await prisma.contaReceber.create({
    data: {
      numero: `CR-${year}-${String(seqCR1.ultimo).padStart(4, "0")}`,
      clienteId: c1.id,
      pedidoVendaId: pv1.id,
      descricao: `Ref. pedido ${pv1.numero}`,
      valorOriginal: 7389.80,
      valorPago: 7389.80,
      dataVencimento: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
      dataPagamento: new Date(now.getTime() - 18 * 24 * 60 * 60 * 1000),
      status: StatusConta.PAGA,
    },
  });

  // Pedido 2 — Confirmado
  const seq2 = await prisma.sequencia.update({ where: { prefixo: "PV" }, data: { ultimo: { increment: 1 } } });
  await prisma.pedidoVenda.create({
    data: {
      numero: `PV-${year}-${String(seq2.ultimo).padStart(4, "0")}`,
      clienteId: c2.id,
      status: StatusPedidoVenda.CONFIRMADO,
      valorTotal: 2695.80,
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      itens: {
        create: [
          { itemId: createdItems["PROD-004"], quantidade: 2, precoUnitario: 1200.00, valorTotal: 2400.00 },
          { itemId: createdItems["PROD-002"], quantidade: 3, precoUnitario: 89.90, valorTotal: 269.70 },
          { itemId: createdItems["SERV-001"], quantidade: 0.177, precoUnitario: 150.00, valorTotal: 26.55 },
        ],
      },
    },
  });

  // Pedido 3 — Orçamento
  const seq3 = await prisma.sequencia.update({ where: { prefixo: "PV" }, data: { ultimo: { increment: 1 } } });
  await prisma.pedidoVenda.create({
    data: {
      numero: `PV-${year}-${String(seq3.ultimo).padStart(4, "0")}`,
      clienteId: c3.id,
      status: StatusPedidoVenda.ORCAMENTO,
      valorTotal: 299.00,
      createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      itens: {
        create: [
          { itemId: createdItems["PROD-003"], quantidade: 1, precoUnitario: 299.00, valorTotal: 299.00 },
        ],
      },
    },
  });

  // Pedido 4 — Faturado (mês atual)
  const seq4 = await prisma.sequencia.update({ where: { prefixo: "PV" }, data: { ultimo: { increment: 1 } } });
  const pv4 = await prisma.pedidoVenda.create({
    data: {
      numero: `PV-${year}-${String(seq4.ultimo).padStart(4, "0")}`,
      clienteId: c1.id,
      status: StatusPedidoVenda.EM_AGENDAMENTO,
      valorTotal: 2500.00,
      createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      itens: {
        create: [
          { itemId: createdItems["SERV-002"], quantidade: 5, precoUnitario: 500.00, valorTotal: 2500.00 },
        ],
      },
    },
  });

  // CR para pedido 4 — Aberta (vence em 15 dias)
  const seqCR2 = await prisma.sequencia.update({ where: { prefixo: "CR" }, data: { ultimo: { increment: 1 } } });
  await prisma.contaReceber.create({
    data: {
      numero: `CR-${year}-${String(seqCR2.ultimo).padStart(4, "0")}`,
      clienteId: c1.id,
      pedidoVendaId: pv4.id,
      descricao: `Ref. pedido ${pv4.numero}`,
      valorOriginal: 2500.00,
      dataVencimento: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
      status: StatusConta.ABERTA,
    },
  });

  // CR vencida (para mostrar alerta no dashboard)
  const seqCR3 = await prisma.sequencia.update({ where: { prefixo: "CR" }, data: { ultimo: { increment: 1 } } });
  await prisma.contaReceber.create({
    data: {
      numero: `CR-${year}-${String(seqCR3.ultimo).padStart(4, "0")}`,
      clienteId: c2.id,
      descricao: "Serviço de consultoria — Fev/2026",
      valorOriginal: 1800.00,
      dataVencimento: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      status: StatusConta.ABERTA,
    },
  });

  // Contas a Pagar
  const seqCP1 = await prisma.sequencia.update({ where: { prefixo: "CP" }, data: { ultimo: { increment: 1 } } });
  await prisma.contaPagar.create({
    data: {
      numero: `CP-${year}-${String(seqCP1.ultimo).padStart(4, "0")}`,
      descricao: "Aluguel do escritório — Mai/2026",
      categoria: "Aluguel",
      valorOriginal: 4500.00,
      dataVencimento: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      status: StatusConta.ABERTA,
    },
  });

  const seqCP2 = await prisma.sequencia.update({ where: { prefixo: "CP" }, data: { ultimo: { increment: 1 } } });
  await prisma.contaPagar.create({
    data: {
      numero: `CP-${year}-${String(seqCP2.ultimo).padStart(4, "0")}`,
      descricao: "Energia elétrica — Abr/2026",
      categoria: "Utilidades",
      valorOriginal: 850.00,
      dataVencimento: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      status: StatusConta.ABERTA,
    },
  });

  const seqCP3 = await prisma.sequencia.update({ where: { prefixo: "CP" }, data: { ultimo: { increment: 1 } } });
  await prisma.contaPagar.create({
    data: {
      numero: `CP-${year}-${String(seqCP3.ultimo).padStart(4, "0")}`,
      descricao: "Nota fiscal da Distribuidora Alfa",
      categoria: "Compra de mercadorias",
      valorOriginal: 12000.00,
      valorPago: 12000.00,
      dataVencimento: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000),
      dataPagamento: new Date(now.getTime() - 24 * 24 * 60 * 60 * 1000),
      status: StatusConta.PAGA,
    },
  });

  // Lançamentos de caixa — receitas dos meses anteriores (para o gráfico)
  const lancamentos = [
    { mesesAtras: 11, valor: 18500 },
    { mesesAtras: 10, valor: 22000 },
    { mesesAtras: 9, valor: 19800 },
    { mesesAtras: 8, valor: 31500 },
    { mesesAtras: 7, valor: 28000 },
    { mesesAtras: 6, valor: 24600 },
    { mesesAtras: 5, valor: 33200 },
    { mesesAtras: 4, valor: 29700 },
    { mesesAtras: 3, valor: 38100 },
    { mesesAtras: 2, valor: 42500 },
    { mesesAtras: 1, valor: 35800 },
  ];

  for (const l of lancamentos) {
    const dataLancamento = new Date(now.getFullYear(), now.getMonth() - l.mesesAtras, 15);
    const cr = await prisma.contaReceber.create({
      data: {
        numero: `CR-HIST-${l.mesesAtras}`,
        clienteId: c1.id,
        descricao: `Receita histórica — mês -${l.mesesAtras}`,
        valorOriginal: l.valor,
        valorPago: l.valor,
        dataVencimento: dataLancamento,
        dataPagamento: dataLancamento,
        status: StatusConta.PAGA,
      },
    });

    await prisma.lancamentoCaixa.create({
      data: {
        tipo: "RECEITA",
        valor: l.valor,
        descricao: `Receita — mês -${l.mesesAtras}`,
        dataLancamento,
        contaReceberId: cr.id,
      },
    });
  }

  console.log("✅ Seed concluído com sucesso!");
  console.log("   → 3 clientes criados");
  console.log("   → 1 fornecedor criado");
  console.log("   → 7 itens criados (com estoque)");
  console.log("   → 4 pedidos de venda criados");
  console.log("   → 5 contas a receber criadas");
  console.log("   → 3 contas a pagar criadas");
  console.log("   → 11 lançamentos históricos para o gráfico de receita");
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
