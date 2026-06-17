// ─────────────────────────────────────────────────────────────────────────────
// Venda à ordem (triangular) — movimentos virtuais de estoque.
//
// Venda em A (ex.: Cimento e Mix) cujo estoque sai de B (ex.: Tramontin). Ao
// ENTREGAR a minuta, modela-se como uma COMPRA VIRTUAL: B vende para A.
//   1. SAÍDA   em B (Tramontin)  — baixa real do material;
//   2. ENTRADA em A (Cimento)    — compra virtual (preço de transferência);
//   3. SAÍDA   em A (Cimento)    — entrega ao cliente final (preço de venda).
// Os 3 movimentos carregam `vendaOrdemId` = pedido de venda (tag de origem).
//
// Usa prismaSemEscopo com empresaId explícito (a operação cruza empresas).
// Idempotente (verifica se já gerou) e best-effort: chamado após a minuta ir
// para ENTREGUE; falhas são logadas e não derrubam a operação.
// ─────────────────────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { prismaSemEscopo } from "@/lib/prisma";
import { generateDocNumber } from "@/lib/utils";

type Tx = Prisma.TransactionClient;

async function proximaSequencia(tx: Tx, empresaId: string, prefixo: string): Promise<number> {
  const seq = await tx.sequencia.upsert({
    where: { empresaId_prefixo: { empresaId, prefixo } },
    update: { ultimo: { increment: 1 } },
    create: { empresaId, prefixo, ultimo: 1 },
  });
  return seq.ultimo;
}

/** Local de estoque padrão (1º ativo) da empresa — cria se não existir. */
async function localPadrao(tx: Tx, empresaId: string): Promise<string> {
  const existente = await tx.localEstoque.findFirst({
    where: { empresaId, ativo: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existente) return existente.id;
  const matriz = await tx.filial.findFirst({ where: { empresaId, matriz: true }, select: { id: true } });
  const novo = await tx.localEstoque.create({
    data: { empresaId, filialId: matriz?.id ?? null, nome: "Principal", descricao: "Criado automaticamente (venda à ordem)" },
  });
  return novo.id;
}

/** SAÍDA/ENTRADA de um item numa empresa+local, com movimento carimbado. */
async function movimentar(
  tx: Tx,
  args: {
    empresaId: string; localEstoqueId: string; itemId: string; tipo: "ENTRADA" | "SAIDA";
    quantidade: Prisma.Decimal; loteId: string; documento: string; observacoes: string;
    valorUnitario: Prisma.Decimal | null; vendaOrdemId?: string | null; devolucaoId?: string | null;
    pedidoVendaItemId?: string | null;
  },
) {
  const estoque = await tx.estoqueItem.findFirst({
    where: { empresaId: args.empresaId, itemId: args.itemId, localEstoqueId: args.localEstoqueId, clienteDonoId: null },
  });
  const saldoAntes = new Prisma.Decimal(estoque?.quantidadeAtual ?? 0);
  const delta = args.tipo === "ENTRADA" ? args.quantidade : args.quantidade.neg();
  const saldoDepois = saldoAntes.add(delta);

  await tx.movimentacaoEstoque.create({
    data: {
      empresaId: args.empresaId,
      itemId: args.itemId,
      tipo: args.tipo,
      quantidade: args.quantidade,
      saldoAntes,
      saldoDepois,
      documento: args.documento,
      observacoes: args.observacoes,
      localEstoqueId: args.localEstoqueId,
      loteId: args.loteId,
      valorUnitario: args.valorUnitario,
      vendaOrdemId: args.vendaOrdemId ?? null,
      devolucaoId: args.devolucaoId ?? null,
      pedidoVendaItemId: args.pedidoVendaItemId ?? null,
    },
  });

  if (estoque) {
    await tx.estoqueItem.update({ where: { id: estoque.id }, data: { quantidadeAtual: saldoDepois } });
  } else {
    await tx.estoqueItem.create({
      data: { empresaId: args.empresaId, clienteDonoId: null, itemId: args.itemId, localEstoqueId: args.localEstoqueId, quantidadeAtual: saldoDepois, quantidadeMin: 0 },
    });
  }
}

async function criarLote(tx: Tx, empresaId: string, tipo: "ENTRADA" | "SAIDA", documento: string, observacoes: string) {
  const ano = new Date().getFullYear();
  const seq = await proximaSequencia(tx, empresaId, "MOV");
  return tx.loteMovimentacao.create({
    data: { empresaId, numero: `MOV-${ano}-${String(seq).padStart(4, "0")}`, tipo, documento, observacoes },
  });
}

/**
 * Gera os 3 movimentos virtuais (saída origem + entrada/saída na empresa da
 * venda) de uma minuta ENTREGUE de venda à ordem. Idempotente.
 */
export async function gerarMovimentosTriangulares(minutaId: string): Promise<void> {
  try {
    const minuta = await prismaSemEscopo.minuta.findUnique({
      where: { id: minutaId },
      include: {
        itens: { include: { pedidoVendaItem: true } },
        pedidoVenda: { include: { empresa: true, cliente: { select: { razaoSocial: true, nomeFantasia: true } }, itens: true } },
      },
    });
    if (!minuta || minuta.status !== "ENTREGUE") return;

    const venda = minuta.pedidoVenda;
    if (!venda.estoqueOrigemEmpresaId) return;       // não é venda à ordem
    if (venda.pedidoVendaOrigemId) return;           // é o próprio pedido de entrega (legado)

    const origem = await prismaSemEscopo.empresa.findFirst({
      where: { id: venda.estoqueOrigemEmpresaId, ativo: true },
      select: { id: true, nomeFantasia: true, razaoSocial: true, fornecedorId: true, clienteId: true },
    });
    if (!origem) {
      console.error(`[venda-ordem] empresa de origem ${venda.estoqueOrigemEmpresaId} inválida — minuta ${minuta.numero}`);
      return;
    }
    const empresaA = venda.empresaId; // empresa da venda (Cimento)
    const origemNome = origem.nomeFantasia ?? origem.razaoSocial;
    const empresaANome = venda.empresa.nomeFantasia ?? venda.empresa.razaoSocial;
    const clienteNome = venda.cliente.nomeFantasia ?? venda.cliente.razaoSocial;

    // Idempotência: já gerou os movimentos desta minuta?
    const jaTem = await prismaSemEscopo.movimentacaoEstoque.findFirst({
      where: { vendaOrdemId: venda.id, documento: minuta.numero },
      select: { id: true },
    });
    if (jaTem) return;

    // Preço de transferência por item (rateio proporcional ao valor da venda).
    const totalVenda = venda.itens.reduce((s, i) => s.add(new Prisma.Decimal(i.valorTotal ?? 0)), new Prisma.Decimal(0));
    const transfer = venda.precoTransferencia != null ? new Prisma.Decimal(venda.precoTransferencia) : null;
    const fator = transfer && totalVenda.gt(0) ? transfer.div(totalVenda) : new Prisma.Decimal(1);

    await prismaSemEscopo.$transaction(async (tx) => {
      const localOrigem = await localPadrao(tx, origem.id);
      const localA = minuta.localEstoqueId ?? await localPadrao(tx, empresaA);

      const loteSaidaB = await criarLote(tx, origem.id, "SAIDA", minuta.numero, `Venda à ordem ${venda.numero} — saída p/ ${empresaANome}`);
      const loteEntradaA = await criarLote(tx, empresaA, "ENTRADA", minuta.numero, `Compra virtual de ${origemNome} (venda à ordem ${venda.numero})`);
      const loteSaidaA = await criarLote(tx, empresaA, "SAIDA", minuta.numero, `Entrega ao cliente ${clienteNome} (venda à ordem ${venda.numero})`);

      let transferTotal = new Prisma.Decimal(0);
      for (const mi of minuta.itens) {
        const qtd = new Prisma.Decimal(mi.quantidadeConvertida ?? mi.quantidade);
        if (qtd.lte(0)) continue;

        const pvi = mi.pedidoVendaItem;
        const precoVenda = new Prisma.Decimal(pvi.precoUnitario ?? 0);
        const totalItem = new Prisma.Decimal(pvi.valorTotal ?? 0);
        // Preço de compra (origem): por item quando informado; senão rateia o total.
        const transferUnit = pvi.precoTransferencia != null
          ? new Prisma.Decimal(pvi.precoTransferencia)
          : (qtd.gt(0) ? totalItem.mul(fator).div(qtd).toDecimalPlaces(4) : precoVenda);
        transferTotal = transferTotal.add(transferUnit.mul(qtd));

        // 1) SAÍDA na origem (Tramontin) — baixa real, valorada na transferência.
        await movimentar(tx, {
          empresaId: origem.id, localEstoqueId: localOrigem, itemId: mi.itemId, tipo: "SAIDA",
          quantidade: qtd, loteId: loteSaidaB.id, documento: minuta.numero,
          observacoes: `Venda à ordem ${venda.numero} — saída p/ ${empresaANome}`,
          valorUnitario: transferUnit, vendaOrdemId: venda.id,
        });
        // 2) ENTRADA na empresa da venda (Cimento) — compra virtual.
        await movimentar(tx, {
          empresaId: empresaA, localEstoqueId: localA, itemId: mi.itemId, tipo: "ENTRADA",
          quantidade: qtd, loteId: loteEntradaA.id, documento: minuta.numero,
          observacoes: `Compra virtual de ${origemNome} (venda à ordem ${venda.numero})`,
          valorUnitario: transferUnit, vendaOrdemId: venda.id,
        });
        // 3) SAÍDA na empresa da venda (Cimento) — entrega ao cliente final.
        await movimentar(tx, {
          empresaId: empresaA, localEstoqueId: localA, itemId: mi.itemId, tipo: "SAIDA",
          quantidade: qtd, loteId: loteSaidaA.id, documento: minuta.numero,
          observacoes: `Entrega ao cliente ${clienteNome} (venda à ordem ${venda.numero})`,
          valorUnitario: precoVenda, vendaOrdemId: venda.id, pedidoVendaItemId: mi.pedidoVendaItemId,
        });
      }

      // ── Financeiro intragrupo (compra virtual A ↔ B), pelo total de transferência.
      const valor = transferTotal.toDecimalPlaces(2);
      const vencimento = minuta.dataEntrega ?? new Date();
      if (valor.gt(0)) {
        // Conta a Receber na origem (B vende p/ A) — cliente = cadastro da empresa da venda.
        if (venda.empresa.clienteId) {
          const nCR = generateDocNumber("CR", await proximaSequencia(tx, origem.id, "CR"));
          await tx.contaReceber.create({
            data: {
              empresaId: origem.id, numero: nCR, clienteId: venda.empresa.clienteId,
              descricao: `Venda à ordem ${venda.numero} p/ ${empresaANome} (minuta ${minuta.numero})`,
              valorOriginal: valor, dataVencimento: vencimento, status: "ABERTA", intragrupo: true,
            },
          });
        }
        // Conta a Pagar na empresa da venda (A compra de B) — fornecedor = cadastro da origem.
        if (origem.fornecedorId) {
          const nCP = generateDocNumber("CP", await proximaSequencia(tx, empresaA, "CP"));
          await tx.contaPagar.create({
            data: {
              empresaId: empresaA, numero: nCP, fornecedorId: origem.fornecedorId,
              descricao: `Compra intragrupo de ${origemNome} — venda à ordem ${venda.numero} (minuta ${minuta.numero})`,
              valorOriginal: valor, dataVencimento: vencimento, status: "ABERTA", intragrupo: true,
            },
          });
        }
      }
    });
  } catch (e) {
    console.error(`[venda-ordem] falha ao gerar movimentos triangulares da minuta ${minutaId}:`, e);
  }
}

/**
 * Compra virtual na empresa da venda (Cimento), disparada quando a minuta do
 * PEDIDO DE ENTREGA da origem (Tramontin) é ENTREGUE. A baixa real na origem já
 * é a própria minuta da entrega — aqui geramos só: ENTRADA na empresa da venda
 * (compra virtual, preço de transferência) + SAÍDA (entrega ao cliente, preço
 * de venda) + financeiro intragrupo (Conta a Receber origem / Conta a Pagar
 * Cimento). Idempotente por (vendaOrdemId + documento da minuta de entrega).
 * `entregaMinutaId` = minuta do pedido de entrega (pedido.pedidoVendaOrigemId set).
 */
export async function gerarCompraVirtualVendaOrdem(entregaMinutaId: string): Promise<void> {
  try {
    const entrega = await prismaSemEscopo.minuta.findUnique({
      where: { id: entregaMinutaId },
      include: { itens: true, pedidoVenda: { select: { id: true, pedidoVendaOrigemId: true, status: true, statusEntrega: true } } },
    });
    if (!entrega || entrega.status !== "ENTREGUE") return;
    const vendaId = entrega.pedidoVenda?.pedidoVendaOrigemId;
    if (!vendaId) return; // não é minuta de pedido de entrega à ordem

    const venda = await prismaSemEscopo.pedidoVenda.findUnique({
      where: { id: vendaId },
      include: { empresa: true, cliente: { select: { razaoSocial: true, nomeFantasia: true } }, itens: true },
    });
    if (!venda?.estoqueOrigemEmpresaId) return;

    const origem = await prismaSemEscopo.empresa.findFirst({
      where: { id: venda.estoqueOrigemEmpresaId, ativo: true },
      select: { id: true, nomeFantasia: true, razaoSocial: true, fornecedorId: true },
    });
    if (!origem) return;
    const empresaA = venda.empresaId;
    const origemNome = origem.nomeFantasia ?? origem.razaoSocial;
    const clienteNome = venda.cliente.nomeFantasia ?? venda.cliente.razaoSocial;

    // Idempotência: já gerou a compra virtual desta entrega?
    const jaTem = await prismaSemEscopo.movimentacaoEstoque.findFirst({
      where: { vendaOrdemId: venda.id, documento: entrega.numero },
      select: { id: true },
    });
    if (jaTem) return;

    // Preço por item da venda (venda + transferência) casado por itemId.
    const totalVenda = venda.itens.reduce((s, i) => s.add(new Prisma.Decimal(i.valorTotal ?? 0)), new Prisma.Decimal(0));
    const transfer = venda.precoTransferencia != null ? new Prisma.Decimal(venda.precoTransferencia) : null;
    const fator = transfer && totalVenda.gt(0) ? transfer.div(totalVenda) : new Prisma.Decimal(1);
    const vItemByItemId = new Map(venda.itens.map((i) => [i.itemId, i]));

    await prismaSemEscopo.$transaction(async (tx) => {
      const localA = await localPadrao(tx, empresaA);
      const loteEntradaA = await criarLote(tx, empresaA, "ENTRADA", entrega.numero, `Compra virtual de ${origemNome} (venda à ordem ${venda.numero})`);
      const loteSaidaA = await criarLote(tx, empresaA, "SAIDA", entrega.numero, `Entrega ao cliente ${clienteNome} (venda à ordem ${venda.numero})`);

      let transferTotal = new Prisma.Decimal(0);
      for (const mi of entrega.itens) {
        const qtd = new Prisma.Decimal(mi.quantidadeConvertida ?? mi.quantidade);
        if (qtd.lte(0)) continue;
        const vi = vItemByItemId.get(mi.itemId);
        const precoVenda = vi ? new Prisma.Decimal(vi.precoUnitario ?? 0) : new Prisma.Decimal(0);
        const totalItem = vi ? new Prisma.Decimal(vi.valorTotal ?? 0) : new Prisma.Decimal(0);
        const transferUnit = vi?.precoTransferencia != null
          ? new Prisma.Decimal(vi.precoTransferencia)
          : (vi && new Prisma.Decimal(vi.quantidade).gt(0)
              ? totalItem.mul(fator).div(new Prisma.Decimal(vi.quantidade)).toDecimalPlaces(4)
              : precoVenda);
        transferTotal = transferTotal.add(transferUnit.mul(qtd));

        // ENTRADA na empresa da venda (compra virtual — preço de transferência).
        await movimentar(tx, {
          empresaId: empresaA, localEstoqueId: localA, itemId: mi.itemId, tipo: "ENTRADA",
          quantidade: qtd, loteId: loteEntradaA.id, documento: entrega.numero,
          observacoes: `Compra virtual de ${origemNome} (venda à ordem ${venda.numero})`,
          valorUnitario: transferUnit, vendaOrdemId: venda.id,
        });
        // SAÍDA na empresa da venda (entrega ao cliente — preço de venda).
        await movimentar(tx, {
          empresaId: empresaA, localEstoqueId: localA, itemId: mi.itemId, tipo: "SAIDA",
          quantidade: qtd, loteId: loteSaidaA.id, documento: entrega.numero,
          observacoes: `Entrega ao cliente ${clienteNome} (venda à ordem ${venda.numero})`,
          valorUnitario: precoVenda, vendaOrdemId: venda.id, pedidoVendaItemId: vi?.id ?? null,
        });
      }

      // Financeiro intragrupo (compra virtual A ↔ B), pelo total de transferência entregue.
      const valor = transferTotal.toDecimalPlaces(2);
      const vencimento = entrega.dataEntrega ?? new Date();
      if (valor.gt(0)) {
        if (venda.empresa.clienteId) {
          const nCR = generateDocNumber("CR", await proximaSequencia(tx, origem.id, "CR"));
          await tx.contaReceber.create({
            data: {
              empresaId: origem.id, numero: nCR, clienteId: venda.empresa.clienteId,
              descricao: `Venda à ordem ${venda.numero} p/ ${venda.empresa.nomeFantasia ?? venda.empresa.razaoSocial} (entrega ${entrega.numero})`,
              valorOriginal: valor, dataVencimento: vencimento, status: "ABERTA", intragrupo: true,
            },
          });
        }
        if (origem.fornecedorId) {
          const nCP = generateDocNumber("CP", await proximaSequencia(tx, empresaA, "CP"));
          await tx.contaPagar.create({
            data: {
              empresaId: empresaA, numero: nCP, fornecedorId: origem.fornecedorId,
              descricao: `Compra intragrupo de ${origemNome} — venda à ordem ${venda.numero} (entrega ${entrega.numero})`,
              valorOriginal: valor, dataVencimento: vencimento, status: "ABERTA", intragrupo: true,
            },
          });
        }
      }
    });

    // Espelha o status de entrega do pedido de entrega (origem) na venda à ordem
    // — que não tem minuta própria. Conclui a venda quando a entrega concluir.
    const ent = entrega.pedidoVenda!;
    await prismaSemEscopo.pedidoVenda.update({
      where: { id: venda.id },
      data: {
        statusEntrega: ent.statusEntrega,
        ...(ent.status === "CONCLUIDO" && venda.status !== "CONCLUIDO"
          ? { status: "CONCLUIDO", dataConclusao: new Date() } : {}),
      },
    });
  } catch (e) {
    console.error(`[venda-ordem] falha ao gerar compra virtual da entrega ${entregaMinutaId}:`, e);
  }
}

/**
 * Reverte os movimentos virtuais de uma DEVOLUÇÃO de venda à ordem: o material
 * volta do cliente para a origem (Tramontin). Espelha ao contrário os 3
 * movimentos: ENTRADA na empresa da venda + SAÍDA na empresa da venda + ENTRADA
 * na origem. Idempotente (checa devolucaoId+documento). Roda na própria
 * transação do endpoint (recebe o tx) para ser atômico com a Devolucao.
 */
export async function reverterMovimentosTriangulares(devolucaoId: string): Promise<void> {
  try {
    const dev = await prismaSemEscopo.devolucao.findUnique({ where: { id: devolucaoId }, include: { itens: true } });
    if (!dev) return;

    const venda = await prismaSemEscopo.pedidoVenda.findUnique({
      where: { id: dev.pedidoVendaId },
      include: { empresa: true, itens: true },
    });
    if (!venda?.estoqueOrigemEmpresaId) return;

    const origem = await prismaSemEscopo.empresa.findFirst({
      where: { id: venda.estoqueOrigemEmpresaId, ativo: true },
      select: { id: true, nomeFantasia: true, razaoSocial: true },
    });
    if (!origem) return;

    // Idempotência: reversão desta devolução já registrada?
    const jaTem = await prismaSemEscopo.movimentacaoEstoque.findFirst({
      where: { devolucaoId: dev.id }, select: { id: true },
    });
    if (jaTem) return;

    const empresaA = venda.empresaId;
    const origemNome = origem.nomeFantasia ?? origem.razaoSocial;
    const vendaNome = venda.empresa.nomeFantasia ?? venda.empresa.razaoSocial;

    const totalVenda = venda.itens.reduce((s, i) => s.add(new Prisma.Decimal(i.valorTotal ?? 0)), new Prisma.Decimal(0));
    const transfer = venda.precoTransferencia != null ? new Prisma.Decimal(venda.precoTransferencia) : null;
    const fator = transfer && totalVenda.gt(0) ? transfer.div(totalVenda) : new Prisma.Decimal(1);
    const pviById = new Map(venda.itens.map((i) => [i.id, i]));

    await prismaSemEscopo.$transaction(async (tx) => {
      const localOrigem = await localPadrao(tx, origem.id);
      const localA = await localPadrao(tx, empresaA);
      const doc = dev.numero;

      const loteEntradaA = await criarLote(tx, empresaA, "ENTRADA", doc, `Devolução ${doc} — retorno do cliente`);
      const loteSaidaA = await criarLote(tx, empresaA, "SAIDA", doc, `Devolução ${doc} — retorno p/ ${origemNome}`);
      const loteEntradaB = await criarLote(tx, origem.id, "ENTRADA", doc, `Devolução ${doc} — retorno de ${vendaNome}`);

      for (const di of dev.itens) {
        const qtd = new Prisma.Decimal(di.quantidade);
        if (qtd.lte(0)) continue;
        const pvi = pviById.get(di.pedidoVendaItemId);
        const precoVenda = new Prisma.Decimal(di.valorUnitario);
        const totalItem = pvi ? new Prisma.Decimal(pvi.valorTotal ?? 0) : qtd.mul(precoVenda);
        const transferUnit = pvi?.precoTransferencia != null
          ? new Prisma.Decimal(pvi.precoTransferencia)
          : (pvi && new Prisma.Decimal(pvi.quantidade).gt(0)
              ? totalItem.mul(fator).div(new Prisma.Decimal(pvi.quantidade)).toDecimalPlaces(4)
              : precoVenda);

        // ENTRADA na empresa da venda (material volta do cliente) — preço de venda.
        await movimentar(tx, {
          empresaId: empresaA, localEstoqueId: localA, itemId: di.itemId, tipo: "ENTRADA",
          quantidade: qtd, loteId: loteEntradaA.id, documento: doc,
          observacoes: `Devolução ${doc} — retorno do cliente`, valorUnitario: precoVenda, devolucaoId: dev.id,
        });
        // SAÍDA na empresa da venda (devolve para a origem) — preço de transferência.
        await movimentar(tx, {
          empresaId: empresaA, localEstoqueId: localA, itemId: di.itemId, tipo: "SAIDA",
          quantidade: qtd, loteId: loteSaidaA.id, documento: doc,
          observacoes: `Devolução ${doc} — retorno p/ ${origemNome}`, valorUnitario: transferUnit, devolucaoId: dev.id,
        });
        // ENTRADA na origem (recebe de volta) — preço de transferência.
        await movimentar(tx, {
          empresaId: origem.id, localEstoqueId: localOrigem, itemId: di.itemId, tipo: "ENTRADA",
          quantidade: qtd, loteId: loteEntradaB.id, documento: doc,
          observacoes: `Devolução ${doc} — retorno de ${vendaNome}`, valorUnitario: transferUnit, devolucaoId: dev.id,
        });
      }
    });
  } catch (e) {
    console.error(`[venda-ordem] falha ao reverter movimentos triangulares da devolução ${devolucaoId}:`, e);
  }
}
