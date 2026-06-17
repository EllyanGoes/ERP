import { prismaSemEscopo } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { custosDaEmpresa } from "@/lib/custo-empresa";

// Motor de lançamentos contábeis (partidas dobradas). Opera cross-empresa com
// empresaId explícito (cada empresa tem seu próprio plano de contas).

export type TipoPartidaIn = "DEBITO" | "CREDITO";
export type OrigemIn = "VENDA" | "RECEBIMENTO" | "COMPRA" | "PAGAMENTO" | "ESTOQUE_ENTRADA" | "ESTOQUE_SAIDA" | "MANUAL" | "ESTORNO";

export type PartidaIn = {
  contaId: string;
  tipo: TipoPartidaIn;
  valor: number;
  clienteId?: string | null;
  fornecedorId?: string | null;
};

export type LancamentoIn = {
  empresaId: string;
  data: Date;
  historico: string;
  origemTipo: OrigemIn;
  origemId?: string | null;
  partidas: PartidaIn[];
};

const EPS = 0.005; // tolerância de centavos no balanceamento

// ── Resolvers de conta (por empresa) ─────────────────────────────────────────
export async function contaPorCodigo(empresaId: string, codigo: string) {
  return prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo }, select: { id: true } });
}
export async function contaDoCliente(empresaId: string, clienteId: string) {
  return prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, clienteId }, select: { id: true } });
}
export async function contaDoFornecedor(empresaId: string, fornecedorId: string) {
  return prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, fornecedorId }, select: { id: true } });
}
export async function contaDoLocal(empresaId: string, localEstoqueId: string) {
  return prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, localEstoqueId }, select: { id: true } });
}
export async function contaDaNatureza(empresaId: string, naturezaFinanceiraId: string) {
  return prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, naturezaFinanceiraId }, select: { id: true } });
}

/**
 * Registra um lançamento contábil balanceado (débito = crédito). Idempotente por
 * (empresaId, origemTipo, origemId): se já existir, retorna o existente sem
 * duplicar. Lança erro se as partidas não fecharem.
 */
export async function registrarLancamento(input: LancamentoIn) {
  const { empresaId, data, historico, origemTipo, origemId = null, partidas } = input;

  if (partidas.length < 2) throw new Error("Lançamento exige ao menos 2 partidas");
  const totalD = partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + p.valor, 0);
  const totalC = partidas.filter((p) => p.tipo === "CREDITO").reduce((s, p) => s + p.valor, 0);
  if (Math.abs(totalD - totalC) > EPS) {
    throw new Error(`Lançamento desbalanceado: débito ${totalD.toFixed(2)} ≠ crédito ${totalC.toFixed(2)}`);
  }
  if (partidas.some((p) => p.valor <= 0)) throw new Error("Toda partida deve ter valor positivo");

  // Idempotência por origem (quando há origem).
  if (origemId) {
    const existente = await prismaSemEscopo.lancamentoContabil.findFirst({
      where: { empresaId, origemTipo, origemId },
      select: { id: true },
    });
    if (existente) return existente;
  }

  return prismaSemEscopo.lancamentoContabil.create({
    data: {
      empresaId,
      data,
      historico,
      origemTipo,
      origemId,
      partidas: {
        create: partidas.map((p) => ({
          empresaId,
          contaId: p.contaId,
          tipo: p.tipo,
          valor: p.valor,
          clienteId: p.clienteId ?? null,
          fornecedorId: p.fornecedorId ?? null,
        })),
      },
    },
    select: { id: true },
  });
}

// ── Contabilização por título (reusada pelo backfill e pelos hooks ao vivo) ───
// Idempotente: gera VENDA e (se houver valor pago) RECEBIMENTO de uma conta a
// receber, conforme o estado atual do título. Best-effort: retorna sem lançar
// quando o plano de contas não resolve.
export async function contabilizarTituloReceber(crId: string) {
  const cr = await prismaSemEscopo.contaReceber.findUnique({
    where: { id: crId },
    select: { id: true, empresaId: true, clienteId: true, naturezaFinanceiraId: true, numero: true, status: true, valorOriginal: true, valorPago: true, dataCompetencia: true, dataPagamento: true, createdAt: true },
  });
  if (!cr || cr.status === "CANCELADA") return;

  // Receita cai na conta da natureza do título; senão na sintética 3.1.
  const [contaCli, contaNat, conta31, contaCaixa] = await Promise.all([
    contaDoCliente(cr.empresaId, cr.clienteId),
    cr.naturezaFinanceiraId ? contaDaNatureza(cr.empresaId, cr.naturezaFinanceiraId) : Promise.resolve(null),
    contaPorCodigo(cr.empresaId, "3.1"),
    contaPorCodigo(cr.empresaId, "1.1.1"),
  ]);
  const contaReceita = contaNat ?? conta31;
  if (!contaCli) return;

  const valor = decimalToNumber(cr.valorOriginal);
  if (valor > 0 && contaReceita) {
    await registrarLancamento({
      empresaId: cr.empresaId, data: cr.dataCompetencia ?? cr.createdAt,
      historico: `Venda — título ${cr.numero}`, origemTipo: "VENDA", origemId: cr.id,
      partidas: [
        { contaId: contaCli.id, tipo: "DEBITO", valor, clienteId: cr.clienteId },
        { contaId: contaReceita.id, tipo: "CREDITO", valor },
      ],
    });
  }
  const pago = decimalToNumber(cr.valorPago);
  if (pago > 0 && contaCaixa) {
    await registrarLancamento({
      empresaId: cr.empresaId, data: cr.dataPagamento ?? cr.createdAt,
      historico: `Recebimento — título ${cr.numero}`, origemTipo: "RECEBIMENTO", origemId: cr.id,
      partidas: [
        { contaId: contaCaixa.id, tipo: "DEBITO", valor: pago },
        { contaId: contaCli.id, tipo: "CREDITO", valor: pago, clienteId: cr.clienteId },
      ],
    });
  }
}

// Idempotente: gera COMPRA e (se houver valor pago) PAGAMENTO de uma conta a
// pagar. Só contabiliza títulos com fornecedor.
export async function contabilizarTituloPagar(cpId: string) {
  const cp = await prismaSemEscopo.contaPagar.findUnique({
    where: { id: cpId },
    select: { id: true, empresaId: true, fornecedorId: true, naturezaFinanceiraId: true, pedidoCompraId: true, numero: true, status: true, valorOriginal: true, valorPago: true, dataCompetencia: true, dataPagamento: true, createdAt: true },
  });
  if (!cp || cp.status === "CANCELADA" || !cp.fornecedorId) return;

  // Compra de estoque (CP de pedido de compra): a perna COMPRA (despesa) NÃO é
  // gerada — a entrada de estoque (D Estoque / C Fornecedor) credita o
  // fornecedor. Só o PAGAMENTO é contabilizado aqui. CP avulso (despesa) segue normal.
  const ehCompraEstoque = cp.pedidoCompraId != null;

  // Despesa/custo cai na conta da natureza do título; senão na sintética 3.3.
  const [contaForn, contaNat, conta33, contaCaixa] = await Promise.all([
    contaDoFornecedor(cp.empresaId, cp.fornecedorId),
    cp.naturezaFinanceiraId ? contaDaNatureza(cp.empresaId, cp.naturezaFinanceiraId) : Promise.resolve(null),
    contaPorCodigo(cp.empresaId, "3.3"),
    contaPorCodigo(cp.empresaId, "1.1.1"),
  ]);
  const contaDespesa = contaNat ?? conta33;
  if (!contaForn) return;

  const valor = decimalToNumber(cp.valorOriginal);
  if (!ehCompraEstoque && valor > 0 && contaDespesa) {
    await registrarLancamento({
      empresaId: cp.empresaId, data: cp.dataCompetencia ?? cp.createdAt,
      historico: `Compra — título ${cp.numero}`, origemTipo: "COMPRA", origemId: cp.id,
      partidas: [
        { contaId: contaDespesa.id, tipo: "DEBITO", valor },
        { contaId: contaForn.id, tipo: "CREDITO", valor, fornecedorId: cp.fornecedorId },
      ],
    });
  }
  const pago = decimalToNumber(cp.valorPago);
  if (pago > 0 && contaCaixa) {
    await registrarLancamento({
      empresaId: cp.empresaId, data: cp.dataPagamento ?? cp.createdAt,
      historico: `Pagamento — título ${cp.numero}`, origemTipo: "PAGAMENTO", origemId: cp.id,
      partidas: [
        { contaId: contaForn.id, tipo: "DEBITO", valor: pago, fornecedorId: cp.fornecedorId },
        { contaId: contaCaixa.id, tipo: "CREDITO", valor: pago },
      ],
    });
  }
}

/**
 * Contabiliza (idempotente) todas as contas a receber de um pedido de venda.
 * Chamado pós-commit nas rotas que geram/baixam CR do pedido.
 */
export async function contabilizarPedidoVenda(pedidoVendaId: string) {
  const crs = await prismaSemEscopo.contaReceber.findMany({ where: { pedidoVendaId }, select: { id: true } });
  for (const cr of crs) await contabilizarTituloReceber(cr.id).catch(() => null);
}

/** Contabiliza (idempotente) todas as contas a pagar de um pedido de compra. */
export async function contabilizarPedidoCompra(pedidoCompraId: string) {
  const cps = await prismaSemEscopo.contaPagar.findMany({ where: { pedidoCompraId }, select: { id: true } });
  for (const cp of cps) await contabilizarTituloPagar(cp.id).catch(() => null);
}

/**
 * Entrada de estoque por conferência de compra (inventário perpétuo):
 * D Estoque (conta do local) / C Fornecedor, pelo valor da NF (qtd × vlrUnitario).
 * Idempotente por (empresa, ESTOQUE_ENTRADA, conferenciaId).
 */
export async function contabilizarEntradaEstoque(conferenciaId: string) {
  const conf = await prismaSemEscopo.conferenciaCompra.findUnique({
    where: { id: conferenciaId },
    select: { id: true, empresaId: true, numero: true, fornecedorId: true, dtEmissao: true, createdAt: true, pedido: { select: { fornecedorId: true } } },
  });
  if (!conf) return;
  const fornecedorId = conf.fornecedorId ?? conf.pedido?.fornecedorId ?? null;
  if (!fornecedorId) return;

  const movs = await prismaSemEscopo.movimentacaoEstoque.findMany({
    where: { empresaId: conf.empresaId, documento: conf.numero, tipo: "ENTRADA", localEstoqueId: { not: null }, valorUnitario: { not: null } },
    select: { localEstoqueId: true, quantidade: true, valorUnitario: true },
  });
  // Valor por local (qtd × vlrUnitario).
  const porLocal = new Map<string, number>();
  for (const m of movs) {
    if (!m.localEstoqueId) continue;
    const v = decimalToNumber(m.quantidade) * decimalToNumber(m.valorUnitario);
    porLocal.set(m.localEstoqueId, (porLocal.get(m.localEstoqueId) ?? 0) + v);
  }
  const total = Array.from(porLocal.values()).reduce((s, v) => s + v, 0);
  if (total <= 0) return;

  const contaForn = await contaDoFornecedor(conf.empresaId, fornecedorId);
  if (!contaForn) return;
  const partidas: PartidaIn[] = [];
  for (const [localId, v] of Array.from(porLocal.entries())) {
    if (v <= 0) continue;
    const cl = await contaDoLocal(conf.empresaId, localId);
    if (!cl) return; // sem conta de local → aborta (não desbalancear)
    partidas.push({ contaId: cl.id, tipo: "DEBITO", valor: v });
  }
  if (partidas.length === 0) return;
  partidas.push({ contaId: contaForn.id, tipo: "CREDITO", valor: total, fornecedorId });

  await registrarLancamento({
    empresaId: conf.empresaId, data: conf.dtEmissao ?? conf.createdAt,
    historico: `Entrada de estoque — ${conf.numero}`, origemTipo: "ESTOQUE_ENTRADA", origemId: conf.id,
    partidas,
  });
}

/**
 * CMV na venda: D Custos (3.2) / C Estoque (conta do local), pelo custo médio
 * (CMPM) dos itens baixados na minuta. Idempotente por (empresa, ESTOQUE_SAIDA, minutaId).
 */
export async function contabilizarCmvMinuta(minutaId: string) {
  const minuta = await prismaSemEscopo.minuta.findUnique({
    where: { id: minutaId },
    select: { id: true, empresaId: true, numero: true, dataEntrega: true, dataEmissao: true, createdAt: true },
  });
  if (!minuta) return;

  const movs = await prismaSemEscopo.movimentacaoEstoque.findMany({
    where: { empresaId: minuta.empresaId, documento: minuta.numero, tipo: "SAIDA", localEstoqueId: { not: null } },
    select: { itemId: true, localEstoqueId: true, quantidade: true },
  });
  if (movs.length === 0) return;

  const custos = await custosDaEmpresa(prismaSemEscopo, minuta.empresaId, Array.from(new Set(movs.map((m) => m.itemId))));
  const porLocal = new Map<string, number>();
  for (const m of movs) {
    if (!m.localEstoqueId) continue;
    const custo = custos.get(m.itemId) ?? 0;
    const v = decimalToNumber(m.quantidade) * (custo ?? 0);
    if (v > 0) porLocal.set(m.localEstoqueId, (porLocal.get(m.localEstoqueId) ?? 0) + v);
  }
  const total = Array.from(porLocal.values()).reduce((s, v) => s + v, 0);
  if (total <= 0) return;

  const contaCusto = await contaPorCodigo(minuta.empresaId, "3.2");
  if (!contaCusto) return;
  const partidas: PartidaIn[] = [{ contaId: contaCusto.id, tipo: "DEBITO", valor: total }];
  for (const [localId, v] of Array.from(porLocal.entries())) {
    if (v <= 0) continue;
    const cl = await contaDoLocal(minuta.empresaId, localId);
    if (!cl) return;
    partidas.push({ contaId: cl.id, tipo: "CREDITO", valor: v });
  }

  await registrarLancamento({
    empresaId: minuta.empresaId, data: minuta.dataEntrega ?? minuta.dataEmissao ?? minuta.createdAt,
    historico: `CMV — saída ${minuta.numero}`, origemTipo: "ESTOQUE_SAIDA", origemId: minuta.id,
    partidas,
  });
}

/**
 * Estorna um lançamento: cria um novo lançamento ESTORNO com as partidas
 * invertidas (débito ↔ crédito). Idempotente (só estorna uma vez).
 */
export async function estornarLancamento(lancamentoId: string) {
  const lan = await prismaSemEscopo.lancamentoContabil.findUnique({
    where: { id: lancamentoId },
    include: { partidas: true, estorno: { select: { id: true } } },
  });
  if (!lan) throw new Error("Lançamento não encontrado");
  if (lan.estorno) return lan.estorno; // já estornado

  return prismaSemEscopo.lancamentoContabil.create({
    data: {
      empresaId: lan.empresaId,
      data: new Date(),
      historico: `Estorno — ${lan.historico}`,
      origemTipo: "ESTORNO",
      estornoDeId: lan.id,
      partidas: {
        create: lan.partidas.map((p) => ({
          empresaId: p.empresaId,
          contaId: p.contaId,
          tipo: p.tipo === "DEBITO" ? "CREDITO" : "DEBITO",
          valor: p.valor,
          clienteId: p.clienteId,
          fornecedorId: p.fornecedorId,
        })),
      },
    },
    select: { id: true },
  });
}
