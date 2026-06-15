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
    valorUnitario: Prisma.Decimal | null; vendaOrdemId: string; pedidoVendaItemId?: string | null;
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
      vendaOrdemId: args.vendaOrdemId,
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
        const transferUnit = qtd.gt(0) ? totalItem.mul(fator).div(qtd).toDecimalPlaces(4) : precoVenda;
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
