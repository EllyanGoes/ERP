import { prismaSemEscopo } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { contaCaixaIdDaEmpresa } from "@/lib/empresa";
import { valoresEstoqueDaEmpresa } from "@/lib/valor-estoque";
import { garantirContaLocalNaEmpresa, garantirContasSistemaEstoque, garantirContasImobilizado, garantirContaResultadoAcumulado, garantirContaCmv, garantirContaCpv, garantirContaReceitaFallback, garantirContaDespesaFallback } from "@/lib/conta-contabil";

// Motor de lançamentos contábeis (partidas dobradas). Opera cross-empresa com
// empresaId explícito (cada empresa tem seu próprio plano de contas).

export type TipoPartidaIn = "DEBITO" | "CREDITO";
export type OrigemIn =
  | "VENDA" | "RECEBIMENTO" | "COMPRA" | "PAGAMENTO"
  | "ESTOQUE_ENTRADA" | "ESTOQUE_SAIDA"
  | "ESTOQUE_PRODUCAO" | "ESTOQUE_CONSUMO" | "ESTOQUE_AJUSTE" | "ESTOQUE_TRANSFERENCIA"
  | "DEPRECIACAO" | "ENCERRAMENTO"
  | "MANUAL" | "ESTORNO";

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
  criadoPor?: string | null;
  partidas: PartidaIn[];
};

const EPS = 0.005; // tolerância de centavos no balanceamento

/** Lançamento recusado por cair em exercício já encerrado. */
export class PeriodoFechadoError extends Error {
  constructor(public ate: Date) {
    super(`Período contábil encerrado até ${ate.toISOString().slice(0, 10)} — lançamento bloqueado`);
    this.name = "PeriodoFechadoError";
  }
}

/** Maior data de fim de exercício FECHADO da empresa (ou null). */
export async function exercicioFechadoAte(empresaId: string): Promise<Date | null> {
  const f = await prismaSemEscopo.fechamentoContabil.findFirst({
    where: { empresaId, status: "FECHADO" },
    orderBy: { dataFim: "desc" },
    select: { dataFim: true },
  });
  return f?.dataFim ?? null;
}

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
export async function contaDoBanco(empresaId: string, contaBancariaId: string) {
  return prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, contaBancariaId }, select: { id: true } });
}

/**
 * Registra um lançamento contábil balanceado (débito = crédito). Idempotente por
 * (empresaId, origemTipo, origemId): se já existir, retorna o existente sem
 * duplicar. Lança erro se as partidas não fecharem.
 */
export async function registrarLancamento(input: LancamentoIn) {
  const { empresaId, data, historico, origemTipo, origemId = null, criadoPor = null, partidas } = input;

  if (partidas.length < 2) throw new Error("Lançamento exige ao menos 2 partidas");
  const totalD = partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + p.valor, 0);
  const totalC = partidas.filter((p) => p.tipo === "CREDITO").reduce((s, p) => s + p.valor, 0);
  if (Math.abs(totalD - totalC) > EPS) {
    throw new Error(`Lançamento desbalanceado: débito ${totalD.toFixed(2)} ≠ crédito ${totalC.toFixed(2)}`);
  }
  if (partidas.some((p) => p.valor <= 0)) throw new Error("Toda partida deve ter valor positivo");

  // Trava de período encerrado: nada datado dentro de um exercício FECHADO,
  // exceto o próprio encerramento e estornos (reabertura). Hooks best-effort
  // pegam o erro e pulam; a API manual o propaga.
  if (origemTipo !== "ENCERRAMENTO" && origemTipo !== "ESTORNO") {
    const fechadoAte = await exercicioFechadoAte(empresaId);
    if (fechadoAte && data <= fechadoAte) throw new PeriodoFechadoError(fechadoAte);
  }

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
      criadoPor,
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
    select: { id: true, empresaId: true, clienteId: true, naturezaFinanceiraId: true, contaBancariaId: true, intragrupo: true, numero: true, status: true, valorOriginal: true, valorPago: true, dataCompetencia: true, dataPagamento: true, createdAt: true },
  });
  if (!cr || cr.status === "CANCELADA") return;

  // Receita cai na conta da natureza do título; senão na sintética 3.1.
  // Caixa/banco: conta de disponibilidade do banco do título; senão a sintética 1.1.1.
  // Caixa/banco do título, ou o "Caixa em Dinheiro" da empresa como padrão —
  // sempre uma analítica sob 1.1.1 (a sintética é só fallback extremo).
  const caixaCbId = cr.contaBancariaId ?? contaCaixaIdDaEmpresa(cr.empresaId);
  const [contaCli, contaNat, contaReceitaFb, contaCaixaResolved, conta111] = await Promise.all([
    contaDoCliente(cr.empresaId, cr.clienteId),
    cr.naturezaFinanceiraId ? contaDaNatureza(cr.empresaId, cr.naturezaFinanceiraId) : Promise.resolve(null),
    garantirContaReceitaFallback(cr.empresaId),
    contaDoBanco(cr.empresaId, caixaCbId),
    contaPorCodigo(cr.empresaId, "1.1.1"),
  ]);
  const contaReceita = contaNat ?? contaReceitaFb;
  const contaCaixa = contaCaixaResolved ?? conta111;
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
  // Caixa só com pagamento de fato; intragrupo nunca lança caixa.
  const pago = decimalToNumber(cr.valorPago);
  if (pago > 0 && !cr.intragrupo && contaCaixa) {
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
    select: { id: true, empresaId: true, fornecedorId: true, naturezaFinanceiraId: true, contaBancariaId: true, intragrupo: true, pedidoCompraId: true, numero: true, status: true, valorOriginal: true, valorPago: true, dataCompetencia: true, dataPagamento: true, createdAt: true },
  });
  if (!cp || cp.status === "CANCELADA" || !cp.fornecedorId) return;

  // Compra de estoque (CP de pedido de compra): a perna COMPRA (despesa) NÃO é
  // gerada — a entrada de estoque (D Estoque / C Fornecedor) credita o
  // fornecedor. Só o PAGAMENTO é contabilizado aqui. CP avulso (despesa) segue normal.
  const ehCompraEstoque = cp.pedidoCompraId != null;

  // Despesa/custo cai na conta da natureza do título; senão na sintética 3.3.
  // Caixa/banco: conta de disponibilidade do banco do título; senão a sintética 1.1.1.
  const caixaCbId = cp.contaBancariaId ?? contaCaixaIdDaEmpresa(cp.empresaId);
  const [contaForn, contaNat, contaDespesaFb, contaCaixaResolved, conta111] = await Promise.all([
    contaDoFornecedor(cp.empresaId, cp.fornecedorId),
    cp.naturezaFinanceiraId ? contaDaNatureza(cp.empresaId, cp.naturezaFinanceiraId) : Promise.resolve(null),
    garantirContaDespesaFallback(cp.empresaId),
    contaDoBanco(cp.empresaId, caixaCbId),
    contaPorCodigo(cp.empresaId, "1.1.1"),
  ]);
  const contaDespesa = contaNat ?? contaDespesaFb;
  const contaCaixa = contaCaixaResolved ?? conta111;
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
  // Caixa só com pagamento de fato; intragrupo nunca lança caixa.
  const pago = decimalToNumber(cp.valorPago);
  if (pago > 0 && !cp.intragrupo && contaCaixa) {
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
 * Custo da venda: baixa do estoque na minuta, separando CMV (mercadoria comprada)
 * de CPV (produto acabado fabricado). Valora pela regra de custeio
 * (`valorUnitarioEstoque`): acabado pelo preço médio de venda, demais pelo CMPM.
 * D 3.2.9002 CMV e/ou 3.2.9003 CPV / C Estoque (conta do local). Idempotente.
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

  const valores = await valoresEstoqueDaEmpresa(minuta.empresaId, movs.map((m) => m.itemId));
  // Crédito de estoque por local; débito separado em CMV (mercadoria) e CPV (acabado).
  const credLocal = new Map<string, number>();
  let totalCmv = 0, totalCpv = 0;
  for (const m of movs) {
    if (!m.localEstoqueId) continue;
    const vi = valores.get(m.itemId);
    const v = decimalToNumber(m.quantidade) * (vi?.valorUnitario ?? 0);
    if (v <= 0) continue;
    credLocal.set(m.localEstoqueId, (credLocal.get(m.localEstoqueId) ?? 0) + v);
    if (vi?.categoria === "PRODUTO_ACABADO") totalCpv += v; else totalCmv += v;
  }
  if (totalCmv + totalCpv <= 0) return;

  const partidas: PartidaIn[] = [];
  if (totalCmv > 0.005) {
    const c = await garantirContaCmv(minuta.empresaId);
    if (!c) return;
    partidas.push({ contaId: c.id, tipo: "DEBITO", valor: totalCmv });
  }
  if (totalCpv > 0.005) {
    const c = await garantirContaCpv(minuta.empresaId);
    if (!c) return;
    partidas.push({ contaId: c.id, tipo: "DEBITO", valor: totalCpv });
  }
  for (const [localId, v] of Array.from(credLocal.entries())) {
    if (v <= 0) continue;
    const cl = await contaDoLocal(minuta.empresaId, localId);
    if (!cl) return;
    partidas.push({ contaId: cl.id, tipo: "CREDITO", valor: v });
  }

  await registrarLancamento({
    empresaId: minuta.empresaId, data: minuta.dataEntrega ?? minuta.dataEmissao ?? minuta.createdAt,
    historico: `Custo da venda — saída ${minuta.numero}`, origemTipo: "ESTOQUE_SAIDA", origemId: minuta.id,
    partidas,
  });
}

// ── Movimentos de estoque não-comerciais (produção/consumo/ajuste/transferência) ──
// Núcleo compartilhado: valora os movimentos ao CMPM, agrega a variação por local
// e monta um lançamento balanceado. A perna de estoque (1.1.3 do local) recebe
// débito quando o saldo sobe e crédito quando desce; a contrapartida vai para a
// conta de resultado indicada (positivo = estoque subiu; negativo = estoque desceu).
// Em transferência (`semContrapartida`), as pernas de estoque se balanceiam sozinhas.

type MovIn = { itemId: string; localEstoqueId: string | null; tipo: string; quantidade: unknown; saldoAntes?: unknown; saldoDepois?: unknown; clienteDonoId?: string | null };

async function postMovimentosEstoque(opts: {
  empresaId: string;
  data: Date;
  historico: string;
  origemTipo: OrigemIn;
  origemId: string;
  movs: MovIn[];
  contaPositivoId?: string | null; // creditada quando o estoque sobe
  contaNegativoId?: string | null; // debitada quando o estoque desce
  semContrapartida?: boolean; // transferência: estoque ↔ estoque
}) {
  const { empresaId, movs } = opts;
  // Só estoque próprio compõe o ativo (ignora estoque de terceiros).
  const proprios = movs.filter((m) => m.localEstoqueId && !m.clienteDonoId);
  if (proprios.length === 0) return;

  const itemIds = Array.from(new Set(proprios.map((m) => m.itemId)));
  const valores = await valoresEstoqueDaEmpresa(empresaId, itemIds);

  // Variação de valor (signed) por local — acabado pelo preço médio de venda, demais pelo CMPM.
  const porLocal = new Map<string, number>();
  for (const m of proprios) {
    if (!m.localEstoqueId) continue;
    const custo = valores.get(m.itemId)?.valorUnitario ?? 0;
    if (!custo) continue; // sem valor → não compõe
    // Direção do AJUSTE pelo sinal de (saldoDepois − saldoAntes); demais pelo tipo.
    let sinal = 0;
    if (m.tipo === "ENTRADA") sinal = 1;
    else if (m.tipo === "SAIDA") sinal = -1;
    else sinal = decimalToNumber(m.saldoDepois) >= decimalToNumber(m.saldoAntes) ? 1 : -1;
    const v = sinal * decimalToNumber(m.quantidade) * custo;
    porLocal.set(m.localEstoqueId, (porLocal.get(m.localEstoqueId) ?? 0) + v);
  }

  let totalPos = 0;
  let totalNeg = 0;
  const partidas: PartidaIn[] = [];
  for (const [localId, v] of Array.from(porLocal.entries())) {
    if (Math.abs(v) < 0.005) continue;
    const cl = await garantirContaLocalNaEmpresa(empresaId, localId);
    if (!cl) return; // sem conta de local → aborta (não desbalancear)
    if (v > 0) { partidas.push({ contaId: cl.id, tipo: "DEBITO", valor: v }); totalPos += v; }
    else { partidas.push({ contaId: cl.id, tipo: "CREDITO", valor: -v }); totalNeg += -v; }
  }
  if (partidas.length === 0) return;

  if (!opts.semContrapartida) {
    if (totalPos > 0.005) {
      if (!opts.contaPositivoId) return;
      partidas.push({ contaId: opts.contaPositivoId, tipo: "CREDITO", valor: totalPos });
    }
    if (totalNeg > 0.005) {
      if (!opts.contaNegativoId) return;
      partidas.push({ contaId: opts.contaNegativoId, tipo: "DEBITO", valor: totalNeg });
    }
  }

  await registrarLancamento({
    empresaId, data: opts.data, historico: opts.historico,
    origemTipo: opts.origemTipo, origemId: opts.origemId, partidas,
  });
}

/**
 * Entrada de produção (PCP): D Estoque (local) / C Custo de Produção (3.2.9001),
 * ao CMPM do produto acabado. Só contabiliza quando a ordem está CONCLUIDA (todas
 * as entradas de acabado já existem). Itens WIP têm CMPM ≈ 0 e não geram valor.
 * Idempotente por (empresa, ESTOQUE_PRODUCAO, ordemId).
 */
export async function contabilizarProducaoOrdem(ordemId: string) {
  const ordem = await prismaSemEscopo.ordemProducao.findUnique({
    where: { id: ordemId },
    select: { id: true, numero: true, status: true, updatedAt: true },
  });
  if (!ordem || ordem.status !== "CONCLUIDA") return;

  const movs = await prismaSemEscopo.movimentacaoEstoque.findMany({
    where: { ordemProducaoId: ordemId, tipo: "ENTRADA", localEstoqueId: { not: null }, clienteDonoId: null },
    select: { itemId: true, localEstoqueId: true, tipo: true, quantidade: true, empresaId: true },
  });
  if (movs.length === 0) return;
  const empresaId = movs[0].empresaId;
  const { producaoId } = await garantirContasSistemaEstoque(empresaId);

  await postMovimentosEstoque({
    empresaId, data: ordem.updatedAt, historico: `Produção — ${ordem.numero}`,
    origemTipo: "ESTOQUE_PRODUCAO", origemId: ordemId,
    movs, contaPositivoId: producaoId,
  });
}

/**
 * Requisição/devolução de materiais: consumo (SAIDA) D Consumo de Materiais
 * (3.3.9001) / C Estoque; devolução (ENTRADA) inverte. Idempotente por
 * (empresa, ESTOQUE_CONSUMO, requisicaoId).
 */
export async function contabilizarRequisicao(requisicaoId: string) {
  const req = await prismaSemEscopo.requisicaoMaterial.findUnique({
    where: { id: requisicaoId },
    select: { id: true, numero: true, status: true, updatedAt: true },
  });
  if (!req || req.status !== "ATENDIDA") return;

  const movs = await prismaSemEscopo.movimentacaoEstoque.findMany({
    where: { documento: req.numero, localEstoqueId: { not: null }, clienteDonoId: null, tipo: { in: ["ENTRADA", "SAIDA"] } },
    select: { itemId: true, localEstoqueId: true, tipo: true, quantidade: true, empresaId: true },
  });
  if (movs.length === 0) return;
  const empresaId = movs[0].empresaId;
  const { consumoId } = await garantirContasSistemaEstoque(empresaId);

  await postMovimentosEstoque({
    empresaId, data: req.updatedAt, historico: `Requisição — ${req.numero}`,
    origemTipo: "ESTOQUE_CONSUMO", origemId: requisicaoId,
    movs, contaPositivoId: consumoId, contaNegativoId: consumoId,
  });
}

/**
 * Inventário (acerto de contagem): sobra D Estoque / C Sobras (3.1.9001); perda
 * D Perdas (3.3.9002) / C Estoque. Idempotente por (empresa, ESTOQUE_AJUSTE, inventarioId).
 */
export async function contabilizarInventario(inventarioId: string) {
  const inv = await prismaSemEscopo.inventarioMaterial.findUnique({
    where: { id: inventarioId },
    select: { id: true, numero: true, status: true, empresaId: true, updatedAt: true },
  });
  if (!inv || inv.status !== "CONCLUIDO") return;

  const movs = await prismaSemEscopo.movimentacaoEstoque.findMany({
    where: { documento: inv.numero, tipo: "AJUSTE", localEstoqueId: { not: null }, clienteDonoId: null },
    select: { itemId: true, localEstoqueId: true, tipo: true, quantidade: true, saldoAntes: true, saldoDepois: true, empresaId: true },
  });
  if (movs.length === 0) return;
  const empresaId = movs[0].empresaId ?? inv.empresaId;
  const { sobrasId, perdasId } = await garantirContasSistemaEstoque(empresaId);

  await postMovimentosEstoque({
    empresaId, data: inv.updatedAt, historico: `Inventário — ${inv.numero}`,
    origemTipo: "ESTOQUE_AJUSTE", origemId: inventarioId,
    movs, contaPositivoId: sobrasId, contaNegativoId: perdasId,
  });
}

/**
 * Lote de movimentação manual: ENTRADA → sobra (C 3.1.9001); SAIDA → perda
 * (D 3.3.9002); lote TRANSFERENCIA → entre contas de local (sem resultado).
 * Idempotente por (empresa, origem, loteId).
 */
export async function contabilizarLoteMovimentacao(loteId: string) {
  const lote = await prismaSemEscopo.loteMovimentacao.findUnique({
    where: { id: loteId },
    select: { id: true, numero: true, tipo: true, createdAt: true },
  });
  if (!lote) return;

  const movs = await prismaSemEscopo.movimentacaoEstoque.findMany({
    where: { loteId, localEstoqueId: { not: null }, clienteDonoId: null, tipo: { in: ["ENTRADA", "SAIDA"] } },
    select: { itemId: true, localEstoqueId: true, tipo: true, quantidade: true, empresaId: true },
  });
  if (movs.length === 0) return;
  const empresaId = movs[0].empresaId;
  const ehTransferencia = lote.tipo === "TRANSFERENCIA";
  const { sobrasId, perdasId } = ehTransferencia
    ? { sobrasId: null, perdasId: null }
    : await garantirContasSistemaEstoque(empresaId);

  await postMovimentosEstoque({
    empresaId, data: lote.createdAt, historico: `Movimentação manual — ${lote.numero}`,
    origemTipo: ehTransferencia ? "ESTOQUE_TRANSFERENCIA" : "ESTOQUE_AJUSTE", origemId: loteId,
    movs, contaPositivoId: sobrasId, contaNegativoId: perdasId, semContrapartida: ehTransferencia,
  });
}

// ── Depreciação do imobilizado ────────────────────────────────────────────────
/** Normaliza uma data para o 1º dia do mês (00:00 UTC) — competência. */
function primeiroDiaDoMes(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * Depreciação linear de um bem para uma competência (mês). Idempotente por
 * (imobilizado, competência) via DepreciacaoLancamento e por (empresa,
 * DEPRECIACAO, depreciacaoId) no lançamento. D Despesa de Depreciação (3.3.9003)
 * / C Depreciação Acumulada (1.2.2). Retorna o valor depreciado (0 se nada).
 */
export async function contabilizarDepreciacaoMes(imobilizadoId: string, competenciaIn: Date): Promise<number> {
  const bem = await prismaSemEscopo.imobilizado.findUnique({
    where: { id: imobilizadoId },
    select: {
      id: true, empresaId: true, status: true, deprecia: true, dataAquisicao: true,
      valorAquisicao: true, valorResidual: true, vidaUtilMeses: true,
      contaDepreciacaoAcumuladaId: true, contaDespesaId: true,
    },
  });
  if (!bem || bem.status !== "ATIVO" || !bem.deprecia || bem.vidaUtilMeses <= 0) return 0;

  const competencia = primeiroDiaDoMes(competenciaIn);
  // Não deprecia antes do mês de aquisição.
  if (competencia < primeiroDiaDoMes(bem.dataAquisicao)) return 0;

  const valorDepreciavel = decimalToNumber(bem.valorAquisicao) - decimalToNumber(bem.valorResidual);
  if (valorDepreciavel <= 0) return 0;

  // Já depreciado acumulado.
  const ja = await prismaSemEscopo.depreciacaoLancamento.aggregate({
    where: { imobilizadoId }, _sum: { valor: true },
  });
  const acumulado = decimalToNumber(ja._sum.valor ?? 0);
  const restante = valorDepreciavel - acumulado;
  if (restante <= 0.005) return 0;

  // Já existe registro para esta competência? (idempotência por mês)
  const existente = await prismaSemEscopo.depreciacaoLancamento.findUnique({
    where: { imobilizadoId_competencia: { imobilizadoId, competencia } },
    select: { id: true },
  });
  if (existente) return 0;

  const mensal = Math.min(Math.round((valorDepreciavel / bem.vidaUtilMeses) * 100) / 100, restante);
  if (mensal <= 0.005) return 0;

  // Resolve contas (campos do bem; fallback para as compartilhadas semeadas).
  let contaDespesaId = bem.contaDespesaId;
  let contaDeprAcumId = bem.contaDepreciacaoAcumuladaId;
  if (!contaDespesaId || !contaDeprAcumId) {
    const c = await garantirContasImobilizado(bem.empresaId);
    contaDespesaId = contaDespesaId ?? c.despesaId;
    contaDeprAcumId = contaDeprAcumId ?? c.deprAcumId;
  }
  if (!contaDespesaId || !contaDeprAcumId) return 0;

  const depr = await prismaSemEscopo.depreciacaoLancamento.create({
    data: { empresaId: bem.empresaId, imobilizadoId, competencia, valor: mensal },
    select: { id: true },
  });

  const lanc = await registrarLancamento({
    empresaId: bem.empresaId, data: competencia,
    historico: `Depreciação — competência ${competencia.toISOString().slice(0, 7)}`,
    origemTipo: "DEPRECIACAO", origemId: depr.id,
    partidas: [
      { contaId: contaDespesaId, tipo: "DEBITO", valor: mensal },
      { contaId: contaDeprAcumId, tipo: "CREDITO", valor: mensal },
    ],
  });
  await prismaSemEscopo.depreciacaoLancamento.update({ where: { id: depr.id }, data: { lancamentoContabilId: lanc.id } });
  return mensal;
}

/** Processa a depreciação de uma competência para todos os bens ATIVO de uma empresa. */
export async function processarDepreciacaoEmpresa(empresaId: string, competencia: Date) {
  const bens = await prismaSemEscopo.imobilizado.findMany({
    where: { empresaId, status: "ATIVO", deprecia: true }, select: { id: true },
  });
  let processados = 0;
  let total = 0;
  for (const b of bens) {
    const v = await contabilizarDepreciacaoMes(b.id, competencia).catch(() => 0);
    if (v > 0) { processados++; total += v; }
  }
  return { processados, total, bens: bens.length };
}

// ── Encerramento do exercício (Fase G parte 2) ────────────────────────────────
function fimDoExercicio(ano: number): Date { return new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999)); }
function inicioDoExercicio(ano: number): Date { return new Date(Date.UTC(ano, 0, 1)); }
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Apura o resultado de um exercício: por analítica de Resultado (grupo RESULTADO,
 * aceitaLancamento), net = Σcrédito − Σdébito das partidas no período. Retorna as
 * partidas que zeram cada conta + o resultado (lucro+/prejuízo−).
 */
async function apurarResultadoExercicio(empresaId: string, dataInicio: Date, dataFim: Date) {
  // Toda conta de Resultado com partidas próprias — inclusive sintéticas onde o
  // motor lança (CMV cai em 3.2; receita/despesa sem natureza caem em 3.1/3.3).
  const contas = await prismaSemEscopo.contaContabil.findMany({
    where: { empresaId, grupo: "RESULTADO" },
    select: { id: true },
  });
  if (contas.length === 0) return { partidas: [] as PartidaIn[], resultado: 0 };
  const contaIds = contas.map((c) => c.id);
  const grupos = await prismaSemEscopo.partidaContabil.groupBy({
    by: ["contaId", "tipo"],
    where: { empresaId, contaId: { in: contaIds }, lancamento: { data: { gte: dataInicio, lte: dataFim } } },
    _sum: { valor: true },
  });
  const deb = new Map<string, number>();
  const cred = new Map<string, number>();
  for (const g of grupos) {
    const v = decimalToNumber(g._sum.valor);
    if (g.tipo === "DEBITO") deb.set(g.contaId, v); else cred.set(g.contaId, v);
  }
  const partidas: PartidaIn[] = [];
  let resultado = 0;
  for (const c of contas) {
    const net = r2((cred.get(c.id) ?? 0) - (deb.get(c.id) ?? 0));
    if (Math.abs(net) < EPS) continue;
    if (net > 0) partidas.push({ contaId: c.id, tipo: "DEBITO", valor: net });
    else partidas.push({ contaId: c.id, tipo: "CREDITO", valor: -net });
    resultado += net;
  }
  return { partidas, resultado: r2(resultado) };
}

/** Apuração (sem gravar) do resultado de um exercício — usado no preview. */
export async function previewEncerramento(empresaId: string, exercicio: number) {
  const { resultado } = await apurarResultadoExercicio(empresaId, inicioDoExercicio(exercicio), fimDoExercicio(exercicio));
  const jaFechado = await prismaSemEscopo.fechamentoContabil.findFirst({ where: { empresaId, exercicio, status: "FECHADO" }, select: { id: true } });
  const maior = await prismaSemEscopo.fechamentoContabil.aggregate({ where: { empresaId, status: "FECHADO" }, _max: { exercicio: true } });
  const podeFechar = !jaFechado && (maior._max.exercicio == null || exercicio > maior._max.exercicio);
  return { exercicio, resultado, jaFechado: !!jaFechado, podeFechar };
}

/**
 * Encerra um exercício: zera as contas de Resultado contra o PL (2.3.2.0001) com
 * um lançamento ENCERRAMENTO datado em 31/dez, e trava lançamentos do período.
 * Sequencial: só fecha exercício posterior ao último fechado.
 */
export async function fecharExercicio(empresaId: string, exercicio: number) {
  const jaFechado = await prismaSemEscopo.fechamentoContabil.findFirst({ where: { empresaId, exercicio, status: "FECHADO" }, select: { id: true } });
  if (jaFechado) throw new Error(`Exercício ${exercicio} já está encerrado`);
  const maior = await prismaSemEscopo.fechamentoContabil.aggregate({ where: { empresaId, status: "FECHADO" }, _max: { exercicio: true } });
  if (maior._max.exercicio != null && exercicio <= maior._max.exercicio) {
    throw new Error(`Há exercício posterior já encerrado (${maior._max.exercicio}); encerre em ordem`);
  }

  const dataInicio = inicioDoExercicio(exercicio);
  const dataFim = fimDoExercicio(exercicio);
  const { partidas, resultado } = await apurarResultadoExercicio(empresaId, dataInicio, dataFim);

  // Registra o fechamento (mesmo com resultado 0 — período fica travado).
  const fechamento = await prismaSemEscopo.fechamentoContabil.upsert({
    where: { empresaId_exercicio: { empresaId, exercicio } },
    update: { status: "FECHADO", reabertoEm: null, dataInicio, dataFim, resultado },
    create: { empresaId, exercicio, dataInicio, dataFim, resultado, status: "FECHADO" },
    select: { id: true },
  });

  if (partidas.length > 0) {
    const plConta = await garantirContaResultadoAcumulado(empresaId);
    if (!plConta) throw new Error("Conta 2.3.2.0001 (Lucros/Prejuízos Acumulados) não encontrada");
    const todas = [...partidas];
    if (resultado > EPS) todas.push({ contaId: plConta.id, tipo: "CREDITO", valor: r2(resultado) });
    else if (resultado < -EPS) todas.push({ contaId: plConta.id, tipo: "DEBITO", valor: r2(-resultado) });
    const lanc = await registrarLancamento({
      empresaId, data: dataFim, historico: `Encerramento do exercício ${exercicio}`,
      origemTipo: "ENCERRAMENTO", origemId: fechamento.id, partidas: todas,
    });
    await prismaSemEscopo.fechamentoContabil.update({ where: { id: fechamento.id }, data: { lancamentoId: lanc.id } });
  }
  return { id: fechamento.id, exercicio, resultado };
}

/**
 * Reabre o exercício mais recente fechado: remove o lançamento de encerramento
 * (partidas primeiro — sem FK cascade no banco) e destrava o período. O controle
 * fica registrado no próprio FechamentoContabil (status REABERTO + reabertoEm),
 * e o encerramento é regenerado do zero num eventual novo fechamento.
 */
export async function reabrirExercicio(empresaId: string, exercicio: number) {
  const fechamento = await prismaSemEscopo.fechamentoContabil.findFirst({
    where: { empresaId, exercicio, status: "FECHADO" },
    select: { id: true, lancamentoId: true },
  });
  if (!fechamento) throw new Error(`Exercício ${exercicio} não está encerrado`);
  const maior = await prismaSemEscopo.fechamentoContabil.aggregate({ where: { empresaId, status: "FECHADO" }, _max: { exercicio: true } });
  if (maior._max.exercicio != null && exercicio < maior._max.exercicio) {
    throw new Error(`Só o último exercício encerrado (${maior._max.exercicio}) pode ser reaberto`);
  }
  if (fechamento.lancamentoId) {
    await prismaSemEscopo.partidaContabil.deleteMany({ where: { lancamentoId: fechamento.lancamentoId } });
    await prismaSemEscopo.lancamentoContabil.delete({ where: { id: fechamento.lancamentoId } }).catch(() => null);
  }
  await prismaSemEscopo.fechamentoContabil.update({
    where: { id: fechamento.id }, data: { status: "REABERTO", reabertoEm: new Date(), lancamentoId: null },
  });
  return { id: fechamento.id, exercicio };
}

/**
 * Estorna um lançamento: cria um novo lançamento ESTORNO com as partidas
 * invertidas (débito ↔ crédito). Idempotente (só estorna uma vez).
 */
export async function estornarLancamento(lancamentoId: string, data?: Date) {
  const lan = await prismaSemEscopo.lancamentoContabil.findUnique({
    where: { id: lancamentoId },
    include: { partidas: true, estorno: { select: { id: true } } },
  });
  if (!lan) throw new Error("Lançamento não encontrado");
  if (lan.estorno) return lan.estorno; // já estornado

  return prismaSemEscopo.lancamentoContabil.create({
    data: {
      empresaId: lan.empresaId,
      data: data ?? new Date(),
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
