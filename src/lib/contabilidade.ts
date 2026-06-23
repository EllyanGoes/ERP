import { prismaSemEscopo } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { decimalToNumber, generateDocNumber } from "@/lib/utils";
import { contaCaixaIdDaEmpresa } from "@/lib/empresa";
import { valoresEstoqueDaEmpresa } from "@/lib/valor-estoque";
import { garantirContaLocalNaEmpresa, garantirContasSistemaEstoque, garantirContasImobilizado, garantirContaResultadoAcumulado, garantirContaCmv, garantirContaCpv, garantirContaReceitaFallback, garantirContaDespesaFallback, garantirContaMaterialEntregar, garantirContaMaterialEntregarCliente, garantirContaDescontoConcedido, garantirContaSaldoAbertura, contaEstoquePrincipal, garantirContaBensEntregar, garantirContaBensEntregarCliente, garantirContaClienteReceber, garantirContaColaboradorNaEmpresa } from "@/lib/conta-contabil";

// Motor de lançamentos contábeis (partidas dobradas). Opera cross-empresa com
// empresaId explícito (cada empresa tem seu próprio plano de contas).

export type TipoPartidaIn = "DEBITO" | "CREDITO";
export type OrigemIn =
  | "VENDA" | "RECEBIMENTO" | "COMPRA" | "PAGAMENTO"
  | "ESTOQUE_ENTRADA" | "ESTOQUE_SAIDA"
  | "ESTOQUE_PRODUCAO" | "ESTOQUE_CONSUMO" | "ESTOQUE_AJUSTE" | "ESTOQUE_TRANSFERENCIA"
  | "DEPRECIACAO" | "ENCERRAMENTO" | "RECEITA_ENTREGA"
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
  // 1.1.2.x (Clientes a Receber). O mesmo clienteId também identifica Material a
  // Entregar (2.1.2.x, PASSIVO) e Bens a Entregar (1.1.4.x, ATIVO) — desambigua
  // pelo código, não pelo grupo (Clientes e Bens são ambos ATIVO).
  return prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, clienteId, codigo: { startsWith: "1.1.2." } }, select: { id: true } });
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
// Contrapartida patrimonial da natureza: ATIVO (a receber) p/ ENTRADA, PASSIVO
// (a pagar) p/ SAIDA. Definida no cadastro da natureza (contaContrapartidaId).
export async function contaContrapartidaDaNatureza(empresaId: string, naturezaFinanceiraId: string) {
  const nat = await prismaSemEscopo.naturezaFinanceira.findFirst({ where: { id: naturezaFinanceiraId, empresaId }, select: { contaContrapartidaId: true } });
  if (!nat?.contaContrapartidaId) return null;
  // Nunca lança em conta SINTÉTICA: quando a contrapartida cadastrada é a
  // sintética de um grupo com analítica por beneficiário (Clientes a Receber,
  // Fornecedores, Salários a Pagar), ela é só a "categoria" — a analítica real é
  // resolvida ANTES pelo beneficiário (contaCli/contaForn/contaColab). Aqui só
  // serve como contrapartida direta se for uma analítica que aceita lançamento.
  const conta = await prismaSemEscopo.contaContabil.findUnique({
    where: { id: nat.contaContrapartidaId }, select: { id: true, tipo: true, aceitaLancamento: true },
  });
  if (!conta || conta.tipo === "SINTETICA" || !conta.aceitaLancamento) return null;
  return { id: conta.id };
}
export async function contaDoBanco(empresaId: string, contaBancariaId: string) {
  return prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, contaBancariaId }, select: { id: true } });
}

// Detalhe dos itens p/ o histórico no padrão do razão: "120× Areia × R$ 85,00;
// 28× Brita 0 × R$ 260,00" — quantidade, produto e preço unitário por item.
function detalheItens(
  itens: { quantidade: unknown; precoUnitario?: unknown; item?: { descricao?: string | null } | null }[],
  max = 4,
): string {
  if (!itens.length) return "";
  const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const partes = itens.slice(0, max).map((it) => {
    const q = decimalToNumber(it.quantidade);
    const qStr = Number.isInteger(q) ? String(q) : q.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
    const desc = it.item?.descricao ?? "item";
    const pu = it.precoUnitario != null ? decimalToNumber(it.precoUnitario) : null;
    return `${qStr}× ${desc}${pu != null ? ` × R$ ${fmt(pu)}` : ""}`;
  });
  const resto = itens.length - max;
  return partes.join("; ") + (resto > 0 ? ` +${resto} item(ns)` : "");
}

// Agrupa movimentações por item (soma a quantidade, mantém o valor unitário e a
// descrição) e devolve o detalhe "qtd× produto × R$ unit" — usado no histórico
// de Entrada de estoque (DE) e Requisição (RM) p/ identificar o que foi movido.
function agruparItensParaDetalhe(
  movs: { itemId: string; quantidade: unknown; valorUnitario?: unknown; item?: { descricao?: string | null } | null }[],
): string {
  const porItem = new Map<string, { quantidade: number; precoUnitario: number | null; item: { descricao: string | null } }>();
  for (const m of movs) {
    const q = decimalToNumber(m.quantidade);
    const cur = porItem.get(m.itemId);
    if (cur) cur.quantidade += q;
    else porItem.set(m.itemId, {
      quantidade: q,
      precoUnitario: m.valorUnitario != null ? decimalToNumber(m.valorUnitario) : null,
      item: { descricao: m.item?.descricao ?? null },
    });
  }
  return detalheItens(Array.from(porItem.values()));
}

// Compara as partidas persistidas com as recalculadas (multiset por
// conta/tipo/valor/cliente/fornecedor) para decidir se há mudança a re-sincronizar.
function mesmasPartidas(
  persistidas: { contaId: string; tipo: string; valor: unknown; clienteId: string | null; fornecedorId: string | null }[],
  novas: PartidaIn[],
): boolean {
  if (persistidas.length !== novas.length) return false;
  const k = (contaId: string, tipo: string, valor: number, cli?: string | null, forn?: string | null) =>
    `${contaId}|${tipo}|${Math.round(valor * 100)}|${cli ?? ""}|${forn ?? ""}`;
  const a = persistidas.map((p) => k(p.contaId, p.tipo, decimalToNumber(p.valor), p.clienteId, p.fornecedorId)).sort();
  const b = novas.map((p) => k(p.contaId, p.tipo, p.valor, p.clienteId, p.fornecedorId)).sort();
  return a.every((x, i) => x === b[i]);
}

/**
 * Registra um lançamento contábil balanceado (débito = crédito). Por
 * (empresaId, origemTipo, origemId): se já existir e estiver igual, retorna o
 * existente; se o fato de origem mudou, RE-SINCRONIZA as partidas no mesmo
 * lançamento (mantém número). Lança erro se as partidas não fecharem.
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

  // Idempotência + RE-SYNC por origem: se já existe um lançamento desta origem,
  // compara com as partidas/histórico/data recalculados. Iguais → retorna (idempotente).
  // Diferentes (ex.: o pedido foi editado depois de contabilizado) → re-sincroniza
  // as partidas no MESMO lançamento, mantendo o número. Assim a contabilidade nunca
  // fica desatualizada quando o fato de origem muda.
  if (origemId) {
    const existente = await prismaSemEscopo.lancamentoContabil.findFirst({
      where: { empresaId, origemTipo, origemId },
      select: {
        id: true, data: true, historico: true,
        partidas: { select: { contaId: true, tipo: true, valor: true, clienteId: true, fornecedorId: true } },
      },
    });
    if (existente) {
      if (
        existente.historico === historico &&
        existente.data.getTime() === data.getTime() &&
        mesmasPartidas(existente.partidas, partidas)
      ) {
        return { id: existente.id };
      }
      await prismaSemEscopo.$transaction([
        prismaSemEscopo.partidaContabil.deleteMany({ where: { lancamentoId: existente.id } }),
        prismaSemEscopo.lancamentoContabil.update({
          where: { id: existente.id },
          data: {
            data, historico,
            partidas: {
              create: partidas.map((p) => ({
                empresaId, contaId: p.contaId, tipo: p.tipo, valor: p.valor,
                clienteId: p.clienteId ?? null, fornecedorId: p.fornecedorId ?? null,
              })),
            },
          },
        }),
      ]);
      return { id: existente.id };
    }
  }

  // Código sequencial do lançamento (LC-AAAA-NNNN), por empresa — identifica o
  // lançamento no razão sem percorrer a rastreabilidade.
  const seq = await prismaSemEscopo.sequencia.upsert({
    where: { empresaId_prefixo: { empresaId, prefixo: "LC" } },
    update: { ultimo: { increment: 1 } },
    create: { empresaId, prefixo: "LC", ultimo: 1 },
  });
  const numero = generateDocNumber("LC", seq.ultimo);

  return prismaSemEscopo.lancamentoContabil.create({
    data: {
      empresaId,
      numero,
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
    select: { id: true, empresaId: true, clienteId: true, naturezaFinanceiraId: true, contaBancariaId: true, intragrupo: true, pedidoVendaId: true, numero: true, descricao: true, status: true, valorOriginal: true, valorPago: true, dataCompetencia: true, dataPagamento: true, createdAt: true,
      cliente: { select: { razaoSocial: true } },
      pedidoVenda: { select: { numero: true, itens: { select: { quantidade: true, precoUnitario: true, item: { select: { descricao: true } } } } } } },
  });
  if (!cr || cr.status === "CANCELADA") return;
  const cliNome = cr.cliente?.razaoSocial ?? "";
  const refPedido = cr.pedidoVenda?.numero ? ` · Pedido ${cr.pedidoVenda.numero}` : "";
  // Itens do pedido (qtd× produto × R$ unit) p/ detalhar a descrição do recebimento.
  const detPedido = cr.pedidoVenda?.itens?.length ? detalheItens(cr.pedidoVenda.itens) : "";
  // Histórico contábil usa a descrição do próprio título (mais claro do que só o
  // número); cai no número quando o título não tem descrição.
  const descCr = cr.descricao?.trim();
  const refCr = descCr ? `${descCr} (${cr.numero})` : `Título ${cr.numero}${refPedido}`;

  // Receita cai na conta da natureza do título; senão na sintética 3.1.
  // Caixa/banco: conta de disponibilidade do banco do título; senão a sintética 1.1.1.
  // Caixa/banco do título, ou o "Caixa em Dinheiro" da empresa como padrão —
  // sempre uma analítica sob 1.1.1 (a sintética é só fallback extremo).
  const caixaCbId = cr.contaBancariaId ?? contaCaixaIdDaEmpresa(cr.empresaId);
  const ehPedido = !!cr.pedidoVendaId;
  const natId = cr.naturezaFinanceiraId;
  const [contaCli, contaReceitaFb, contaCaixaResolved, conta111, contaNatRes, contaNatContra] = await Promise.all([
    cr.clienteId ? garantirContaClienteReceber(cr.empresaId, cr.clienteId) : Promise.resolve(null),
    garantirContaReceitaFallback(cr.empresaId),
    contaDoBanco(cr.empresaId, caixaCbId),
    contaPorCodigo(cr.empresaId, "1.1.1"),
    natId ? contaDaNatureza(cr.empresaId, natId) : Promise.resolve(null),
    natId ? contaContrapartidaDaNatureza(cr.empresaId, natId) : Promise.resolve(null),
  ]);
  // Receita do título AVULSO: conta de resultado da NATUREZA (ex.: receita
  // financeira), senão o fallback unificado de Receita de Vendas.
  const contaReceita = contaNatRes ?? contaReceitaFb;
  // ATIVO (recebível): com cliente é Clientes a Receber; sem vínculo é a
  // contrapartida ativa da natureza (ex.: Outros a Receber).
  const contaAtivo = cr.clienteId ? contaCli : contaNatContra;
  const cli = cr.clienteId ?? undefined;
  if (!contaAtivo) return;

  // Venda de PEDIDO: o recebível já nasceu na CONFIRMAÇÃO (D Clientes a Receber /
  // C Material a Entregar, em contabilizarVendaPedido) e a receita na ENTREGA —
  // aqui não se repete. Só a venda AVULSA (CR sem pedido) gera a perna VENDA:
  // D Ativo (Clientes ou contrapartida da natureza) / C Receita.
  const valor = decimalToNumber(cr.valorOriginal);
  if (!ehPedido && valor > 0 && contaReceita) {
    await registrarLancamento({
      empresaId: cr.empresaId, data: cr.dataCompetencia ?? cr.createdAt,
      historico: `Venda — ${refCr}${cliNome ? ` · ${cliNome}` : ""}`, origemTipo: "VENDA", origemId: cr.id,
      partidas: [
        { contaId: contaAtivo.id, tipo: "DEBITO", valor, clienteId: cli },
        { contaId: contaReceita.id, tipo: "CREDITO", valor },
      ],
    });
  }
  // Recebimento: caixa só com pagamento de fato; intragrupo nunca lança caixa.
  // O caixa vai para o BANCO REAL de cada baixa (LancamentoFinanceiro), não unificado.
  const pago = decimalToNumber(cr.valorPago);
  if (pago > 0 && !cr.intragrupo) {
    const pagtos = await prismaSemEscopo.lancamentoFinanceiro.findMany({
      where: { contaReceberId: cr.id, tipo: "RECEITA" }, select: { contaBancariaId: true, valor: true },
    });
    const porBanco = new Map<string, number>();
    for (const lf of pagtos) porBanco.set(lf.contaBancariaId, (porBanco.get(lf.contaBancariaId) ?? 0) + decimalToNumber(lf.valor));
    if (porBanco.size === 0) porBanco.set(caixaCbId, pago); // legado sem baixa detalhada
    const partidas: PartidaIn[] = [];
    let total = 0;
    for (const [cbId, v] of Array.from(porBanco.entries())) {
      if (v <= 0.005) continue;
      const cb = (await contaDoBanco(cr.empresaId, cbId)) ?? contaCaixaResolved ?? conta111;
      if (!cb) continue;
      partidas.push({ contaId: cb.id, tipo: "DEBITO", valor: Math.round(v * 100) / 100 });
      total += v;
    }
    total = Math.round(total * 100) / 100;
    if (total > 0 && partidas.length) {
      partidas.push({ contaId: contaAtivo.id, tipo: "CREDITO", valor: total, clienteId: cli });
      await registrarLancamento({
        empresaId: cr.empresaId, data: cr.dataPagamento ?? cr.createdAt,
        historico: `Recebimento — ${refCr}${cliNome ? ` · ${cliNome}` : ""}${detPedido ? ` · ${detPedido}` : ""}`, origemTipo: "RECEBIMENTO", origemId: cr.id,
        partidas,
      });
    }
  }
}

// Idempotente: gera COMPRA e (se houver valor pago) PAGAMENTO de uma conta a
// pagar. Títulos sem fornecedor (despesa avulsa paga direto) geram só o
// pagamento D Despesa / C Caixa/Banco.
export async function contabilizarTituloPagar(cpId: string) {
  const cp = await prismaSemEscopo.contaPagar.findUnique({
    where: { id: cpId },
    select: { id: true, empresaId: true, fornecedorId: true, beneficiarioTipo: true, beneficiarioId: true, naturezaFinanceiraId: true, contaBancariaId: true, intragrupo: true, pedidoCompraId: true, numero: true, descricao: true, status: true, valorOriginal: true, valorPago: true, dataCompetencia: true, dataPagamento: true, createdAt: true, empresa: { select: { industrializa: true } } },
  });
  if (!cp || cp.status === "CANCELADA") return;

  // Histórico contábil usa a descrição do próprio título (mais claro do que só o
  // número); cai no número quando o título não tem descrição.
  const descCp = cp.descricao?.trim();
  const refCp = descCp ? `${descCp} (${cp.numero})` : `título ${cp.numero}`;

  // Compra de estoque (CP de pedido de compra): a perna COMPRA (despesa) NÃO é
  // gerada — a entrada de estoque (D Estoque / C Fornecedor) credita o
  // fornecedor. Só o PAGAMENTO é contabilizado aqui. CP avulso (despesa) segue normal.
  const ehCompraEstoque = cp.pedidoCompraId != null;

  // Despesa/custo cai na conta da natureza do título; senão na sintética 3.3.
  // Caixa/banco: conta de disponibilidade do banco do título; senão a sintética 1.1.1.
  const caixaCbId = cp.contaBancariaId ?? contaCaixaIdDaEmpresa(cp.empresaId);
  const [contaForn, contaNat, contaNatContra, contaDespesaFb, contaCaixaResolved, conta111] = await Promise.all([
    cp.fornecedorId ? contaDoFornecedor(cp.empresaId, cp.fornecedorId) : Promise.resolve(null),
    cp.naturezaFinanceiraId ? contaDaNatureza(cp.empresaId, cp.naturezaFinanceiraId) : Promise.resolve(null),
    cp.naturezaFinanceiraId ? contaContrapartidaDaNatureza(cp.empresaId, cp.naturezaFinanceiraId) : Promise.resolve(null),
    garantirContaDespesaFallback(cp.empresaId),
    contaDoBanco(cp.empresaId, caixaCbId),
    contaPorCodigo(cp.empresaId, "1.1.1"),
  ]);

  // Pernas de crédito de caixa/banco a partir das baixas (LancamentoFinanceiro),
  // por banco real; fallback no caixa da empresa. Retorna partidas CREDITO + total.
  const pernasDeBanco = async (valorBaixa: number) => {
    const pagtos = await prismaSemEscopo.lancamentoFinanceiro.findMany({
      where: { contaPagarId: cp.id, tipo: "DESPESA" }, select: { contaBancariaId: true, valor: true },
    });
    const porBanco = new Map<string, number>();
    for (const lf of pagtos) porBanco.set(lf.contaBancariaId, (porBanco.get(lf.contaBancariaId) ?? 0) + decimalToNumber(lf.valor));
    if (porBanco.size === 0) porBanco.set(caixaCbId, valorBaixa); // legado sem baixa detalhada
    const partidas: PartidaIn[] = [];
    let total = 0;
    for (const [cbId, v] of Array.from(porBanco.entries())) {
      if (v <= 0.005) continue;
      const cb = (await contaDoBanco(cp.empresaId, cbId)) ?? contaCaixaResolved ?? conta111;
      if (!cb) continue;
      partidas.push({ contaId: cb.id, tipo: "CREDITO", valor: Math.round(v * 100) / 100 });
      total += v;
    }
    return { partidas, total: Math.round(total * 100) / 100 };
  };

  const pago = decimalToNumber(cp.valorPago);

  // SAÍDA SEM fornecedor (vale, combustível, encargos como INSS patronal/FGTS…).
  if (!cp.fornecedorId) {
    if (cp.intragrupo) return;
    const contaDesp = contaNat ?? contaDespesaFb;
    if (!contaDesp) return;

    // Beneficiário COLABORADOR: o passivo vai para a conta do colaborador (sob
    // Salários a Pagar 2.1.6.x), criada na empresa onde ele está presente. Senão,
    // usa o passivo da natureza.
    const contaColab = cp.beneficiarioTipo === "COLABORADOR" && cp.beneficiarioId
      ? await garantirContaColaboradorNaEmpresa(cp.empresaId, cp.beneficiarioId)
      : null;
    const contaPassivo = contaColab ?? contaNatContra;

    // Com PASSIVO (colaborador ou natureza): a despesa passa pelo passivo.
    // Provisão (competência) D Despesa / C Passivo; liquidação D Passivo / C Caixa.
    // Pagamento direto = as duas na mesma data (Caso 3).
    if (contaPassivo) {
      const valorComp = decimalToNumber(cp.valorOriginal);
      if (valorComp > 0) {
        await registrarLancamento({
          empresaId: cp.empresaId, data: cp.dataCompetencia ?? cp.createdAt,
          historico: `Provisão — ${refCp}`, origemTipo: "COMPRA", origemId: cp.id,
          partidas: [
            { contaId: contaDesp.id, tipo: "DEBITO", valor: valorComp },
            { contaId: contaPassivo.id, tipo: "CREDITO", valor: valorComp },
          ],
        });
      }
      if (pago > 0) {
        const { partidas, total } = await pernasDeBanco(pago);
        if (total > 0 && partidas.length) {
          partidas.unshift({ contaId: contaPassivo.id, tipo: "DEBITO", valor: total });
          await registrarLancamento({
            empresaId: cp.empresaId, data: cp.dataPagamento ?? cp.createdAt,
            historico: `Pagamento — ${refCp}`, origemTipo: "PAGAMENTO", origemId: cp.id,
            partidas,
          });
        }
      }
      return;
    }

    // Sem passivo na natureza (compat): pagamento direto D Despesa / C Caixa.
    if (pago <= 0) return;
    const { partidas, total } = await pernasDeBanco(pago);
    if (total <= 0 || partidas.length === 0) return;
    partidas.unshift({ contaId: contaDesp.id, tipo: "DEBITO", valor: total });
    await registrarLancamento({
      empresaId: cp.empresaId, data: cp.dataPagamento ?? cp.createdAt,
      historico: `Pagamento — ${refCp}`, origemTipo: "PAGAMENTO", origemId: cp.id,
      partidas,
    });
    return;
  }

  // Sem natureza: empresa de revenda (não industrializa) → compra de mercadoria
  // entra no ESTOQUE (ativo, modelo perpétuo); fábrica → Despesas Gerais.
  let contaDespesa = contaNat;
  if (!contaDespesa) {
    contaDespesa = cp.empresa?.industrializa === false
      ? (await contaEstoquePrincipal(cp.empresaId)) ?? contaDespesaFb
      : contaDespesaFb;
  }
  const contaCaixa = contaCaixaResolved ?? conta111;
  if (!contaForn) return;

  const valor = decimalToNumber(cp.valorOriginal);
  if (!ehCompraEstoque && valor > 0 && contaDespesa) {
    await registrarLancamento({
      empresaId: cp.empresaId, data: cp.dataCompetencia ?? cp.createdAt,
      historico: `Compra — ${refCp}`, origemTipo: "COMPRA", origemId: cp.id,
      partidas: [
        { contaId: contaDespesa.id, tipo: "DEBITO", valor },
        { contaId: contaForn.id, tipo: "CREDITO", valor, fornecedorId: cp.fornecedorId },
      ],
    });
  }
  // Pagamento: caixa só com pagamento de fato; intragrupo nunca lança caixa.
  // O caixa sai do BANCO REAL de cada baixa (LancamentoFinanceiro), não unificado.
  if (pago > 0 && !cp.intragrupo) {
    const { partidas, total } = await pernasDeBanco(pago);
    if (total > 0 && partidas.length) {
      partidas.unshift({ contaId: contaForn.id, tipo: "DEBITO", valor: total, fornecedorId: cp.fornecedorId });
      await registrarLancamento({
        empresaId: cp.empresaId, data: cp.dataPagamento ?? cp.createdAt,
        historico: `Pagamento — ${refCp}`, origemTipo: "PAGAMENTO", origemId: cp.id,
        partidas,
      });
    }
  }
}

/**
 * Contabiliza (idempotente) todas as contas a receber de um pedido de venda.
 * Chamado pós-commit nas rotas que geram/baixam CR do pedido.
 */
export async function contabilizarPedidoVenda(pedidoVendaId: string) {
  // Venda pelo PEDIDO (D Clientes / C Material a Entregar) — independe de faturamento.
  await contabilizarVendaPedido(pedidoVendaId).catch(() => null);
  // CRs do pedido: para o RECEBIMENTO (baixa). A perna VENDA da CR é pulada
  // quando há pedido (já contabilizada acima).
  const crs = await prismaSemEscopo.contaReceber.findMany({ where: { pedidoVendaId }, select: { id: true } });
  for (const cr of crs) await contabilizarTituloReceber(cr.id).catch(() => null);
}

/**
 * Venda pelo PEDIDO: na confirmação (faturado ou não) reconhece a obrigação de
 * entregar e o controle do backlog — D Bens a Entregar (ativo controle) / C
 * Material a Entregar (passivo), pelo valor total do pedido. O recebível
 * (Clientes a Receber) e a receita só nascem na ENTREGA (com o título), para o
 * contábil convergir com o financeiro. Idempotente por (empresa, VENDA,
 * pedidoId). Pula orçamento/cancelado/intragrupo.
 */
export async function contabilizarVendaPedido(pedidoVendaId: string) {
  const pedido = await prismaSemEscopo.pedidoVenda.findUnique({
    where: { id: pedidoVendaId },
    select: {
      id: true, empresaId: true, clienteId: true, numero: true, status: true, intragrupo: true, valorTotal: true, createdAt: true,
      cliente: { select: { razaoSocial: true } },
      itens: { select: { quantidade: true, precoUnitario: true, item: { select: { descricao: true } } } },
    },
  });
  if (!pedido || pedido.intragrupo) return;
  if (!["CONFIRMADO", "EM_AGENDAMENTO", "CONCLUIDO"].includes(pedido.status)) return;
  const valor = decimalToNumber(pedido.valorTotal);
  if (valor <= 0) return;

  const [contaCli, contaMat] = await Promise.all([
    garantirContaClienteReceber(pedido.empresaId, pedido.clienteId),
    garantirContaMaterialEntregarCliente(pedido.empresaId, pedido.clienteId),
  ]);
  if (!contaCli || !contaMat) return;

  // Modelo clássico "venda a entregar": na confirmação reconhece o direito a
  // receber e a obrigação de entregar — D Clientes a Receber / C Material a
  // Entregar, pelo valor total. Receita só na entrega (contabilizarReceitaMinuta).
  // Histórico no padrão do razão: pedido · cliente · itens (qtd × produto × preço).
  const detalhe = detalheItens(pedido.itens);
  const cli = pedido.cliente?.razaoSocial ?? "";
  const historico = `Venda (a entregar) — Pedido ${pedido.numero}${cli ? ` · ${cli}` : ""}${detalhe ? ` · ${detalhe}` : ""}`;
  await registrarLancamento({
    empresaId: pedido.empresaId, data: pedido.createdAt,
    historico, origemTipo: "VENDA", origemId: pedido.id,
    partidas: [
      { contaId: contaCli.id, tipo: "DEBITO", valor, clienteId: pedido.clienteId },
      { contaId: contaMat.id, tipo: "CREDITO", valor, clienteId: pedido.clienteId },
    ],
  });
}

/**
 * Realinha o contábil de um pedido ao cliente ATUAL após troca de cliente no
 * pedido (regra: o título segue o cliente do pedido). A idempotência de
 * `registrarLancamento` só CRIA — então é preciso apagar os lançamentos por
 * origem antes de regravar, para as partidas pegarem o novo cliente. Best-effort.
 */
export async function recontabilizarClientePedido(pedidoVendaId: string) {
  const pedido = await prismaSemEscopo.pedidoVenda.findUnique({
    where: { id: pedidoVendaId },
    select: { empresaId: true, contasReceber: { select: { id: true } }, minutas: { select: { id: true } } },
  });
  if (!pedido) return;
  const { empresaId } = pedido;
  const crIds = pedido.contasReceber.map((c) => c.id);
  const minutaIds = pedido.minutas.map((m) => m.id);

  await apagarLancamentosContabeis({ empresaId, origemTipo: "VENDA", origemId: pedidoVendaId }); // venda a entregar (pedido)
  if (crIds.length) await apagarLancamentosContabeis({ empresaId, origemTipo: { in: ["VENDA", "RECEBIMENTO"] }, origemId: { in: crIds } }); // título
  if (minutaIds.length) await apagarLancamentosContabeis({ empresaId, origemTipo: "RECEITA_ENTREGA", origemId: { in: minutaIds } }); // entrega

  // Regrava tudo a partir do estado atual (cliente novo).
  await contabilizarPedidoVenda(pedidoVendaId).catch(() => null);
  for (const m of pedido.minutas) await contabilizarReceitaMinuta(m.id).catch(() => null);
}

// ── Re-sincronização por processo (apaga e refaz a partir do estado atual) ─────
// Mesmo mecanismo do recontabilizarClientePedido, para CADA processo ligado à
// contabilidade. Deve ser chamado na EDIÇÃO de cada documento (best-effort,
// pós-commit) para o contábil nunca ficar defasado quando o fato de origem muda.

export async function recontabilizarTituloReceber(crId: string) {
  await apagarLancamentosContabeis({ origemTipo: { in: ["VENDA", "RECEBIMENTO"] }, origemId: crId });
  await contabilizarTituloReceber(crId).catch(() => null);
}
export async function recontabilizarTituloPagar(cpId: string) {
  await apagarLancamentosContabeis({ origemTipo: { in: ["COMPRA", "PAGAMENTO"] }, origemId: cpId });
  await contabilizarTituloPagar(cpId).catch(() => null);
}
export async function recontabilizarConferencia(conferenciaId: string) {
  await apagarLancamentosContabeis({ origemTipo: "ESTOQUE_ENTRADA", origemId: conferenciaId });
  await contabilizarEntradaEstoque(conferenciaId).catch(() => null);
}
export async function recontabilizarMinuta(minutaId: string) {
  await apagarLancamentosContabeis({ origemTipo: { in: ["ESTOQUE_SAIDA", "RECEITA_ENTREGA"] }, origemId: minutaId });
  await contabilizarCmvMinuta(minutaId).catch(() => null);
  await contabilizarReceitaMinuta(minutaId).catch(() => null);
}
export async function recontabilizarRequisicao(requisicaoId: string) {
  await apagarLancamentosContabeis({ origemTipo: "ESTOQUE_CONSUMO", origemId: requisicaoId });
  await contabilizarRequisicao(requisicaoId).catch(() => null);
}
export async function recontabilizarOrdemProducao(ordemId: string) {
  await apagarLancamentosContabeis({ origemTipo: "ESTOQUE_PRODUCAO", origemId: ordemId });
  await contabilizarProducaoOrdem(ordemId).catch(() => null);
}
export async function recontabilizarInventario(inventarioId: string) {
  await apagarLancamentosContabeis({ origemTipo: "ESTOQUE_AJUSTE", origemId: inventarioId });
  await contabilizarInventario(inventarioId).catch(() => null);
}
export async function recontabilizarLoteMovimentacao(loteId: string) {
  await apagarLancamentosContabeis({ origemTipo: { in: ["ESTOQUE_TRANSFERENCIA", "ESTOQUE_AJUSTE"] }, origemId: loteId });
  await contabilizarLoteMovimentacao(loteId).catch(() => null);
}

/**
 * Apaga lançamentos contábeis E suas PARTIDAS por filtro. PartidaContabil NÃO
 * tem FK em cascata no banco — apagar só o LancamentoContabil deixa partidas
 * órfãs que corrompem o balanço. Sempre apagar as partidas ANTES. Retorna a
 * quantidade de lançamentos removidos.
 */
export async function apagarLancamentosContabeis(where: Prisma.LancamentoContabilWhereInput): Promise<number> {
  const lancs = await prismaSemEscopo.lancamentoContabil.findMany({ where, select: { id: true } });
  if (!lancs.length) return 0;
  const ids = lancs.map((l) => l.id);
  await prismaSemEscopo.partidaContabil.deleteMany({ where: { lancamentoId: { in: ids } } });
  await prismaSemEscopo.lancamentoContabil.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

/**
 * Saldo de abertura de estoque (perpétuo): contabiliza as movimentações
 * `SALDO-INICIAL` valorando cada item pela regra de custeio (acabado pelo preço
 * médio de venda; demais pelo CMPM). D Estoque (local) / C 2.3.3 Saldos de
 * Abertura. Resolve o estoque contábil negativo (saídas sem as entradas iniciais).
 * Idempotente por (empresa, ESTOQUE_AJUSTE, abertura-estoque-<empresaId>).
 */
export async function contabilizarSaldoInicialEstoque(empresaId: string) {
  const movs = await prismaSemEscopo.movimentacaoEstoque.findMany({
    where: { empresaId, tipo: "ENTRADA", documento: "SALDO-INICIAL", localEstoqueId: { not: null }, clienteDonoId: null },
    select: { itemId: true, localEstoqueId: true, quantidade: true, createdAt: true },
  });
  if (movs.length === 0) return;

  const valores = await valoresEstoqueDaEmpresa(empresaId, movs.map((m) => m.itemId));
  const porLocal = new Map<string, number>();
  let dataMin: Date | null = null;
  for (const m of movs) {
    if (!m.localEstoqueId) continue;
    const u = valores.get(m.itemId)?.valorUnitario ?? 0;
    if (!u) continue;
    porLocal.set(m.localEstoqueId, (porLocal.get(m.localEstoqueId) ?? 0) + decimalToNumber(m.quantidade) * u);
    const d = m.createdAt ? new Date(m.createdAt) : null;
    if (d && (!dataMin || d < dataMin)) dataMin = d;
  }

  const contaAbertura = await garantirContaSaldoAbertura(empresaId);
  if (!contaAbertura) return;
  const partidas: PartidaIn[] = [];
  let totalDeb = 0;
  for (const [localId, v] of Array.from(porLocal.entries())) {
    const r = Math.round(v * 100) / 100;
    if (r <= 0.005) continue;
    const cl = await garantirContaLocalNaEmpresa(empresaId, localId);
    if (!cl) return;
    partidas.push({ contaId: cl.id, tipo: "DEBITO", valor: r });
    totalDeb += r;
  }
  totalDeb = Math.round(totalDeb * 100) / 100;
  if (totalDeb <= 0.005 || partidas.length === 0) return;
  partidas.push({ contaId: contaAbertura.id, tipo: "CREDITO", valor: totalDeb });

  await registrarLancamento({
    empresaId, data: dataMin ?? new Date(),
    historico: "Saldo de abertura de estoque", origemTipo: "ESTOQUE_AJUSTE", origemId: `abertura-estoque-${empresaId}`,
    partidas,
  });
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
    select: { localEstoqueId: true, itemId: true, quantidade: true, valorUnitario: true, item: { select: { descricao: true } } },
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

  // Detalhe dos itens (qtd× produto × R$ unit) p/ identificar o que entrou.
  const detItens = agruparItensParaDetalhe(movs);

  await registrarLancamento({
    empresaId: conf.empresaId, data: conf.dtEmissao ?? conf.createdAt,
    historico: `Entrada de estoque — ${conf.numero}${detItens ? ` — ${detItens}` : ""}`, origemTipo: "ESTOQUE_ENTRADA", origemId: conf.id,
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
    select: {
      id: true, empresaId: true, numero: true, dataEntrega: true, dataEmissao: true, createdAt: true,
      empresa: { select: { industrializa: true } },
      pedidoVenda: { select: { numero: true } },
      itens: { select: { quantidade: true, item: { select: { descricao: true } }, pedidoVendaItem: { select: { precoUnitario: true } } } },
    },
  });
  if (!minuta) return;
  // Só fábrica usa CPV; empresa de pura revenda (ex.: Cimento e Mix) lança tudo
  // em CMV mesmo que o item seja produto acabado no grupo (quem produz é a irmã).
  const usaCpv = minuta.empresa?.industrializa ?? false;

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
    if (usaCpv && vi?.categoria === "PRODUTO_ACABADO") totalCpv += v; else totalCmv += v;
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

  // Histórico no padrão do razão: minuta · pedido de venda · itens (qtd× produto × R$).
  const detItens = detalheItens(minuta.itens.map((it) => ({
    quantidade: it.quantidade, precoUnitario: it.pedidoVendaItem?.precoUnitario, item: it.item,
  })));
  const pedNum = minuta.pedidoVenda?.numero;
  await registrarLancamento({
    empresaId: minuta.empresaId, data: minuta.dataEntrega ?? minuta.dataEmissao ?? minuta.createdAt,
    historico: `Custo da venda — saída ${minuta.numero}${pedNum ? ` · Pedido ${pedNum}` : ""}${detItens ? ` — ${detItens}` : ""}`, origemTipo: "ESTOQUE_SAIDA", origemId: minuta.id,
    partidas,
  });
}

/**
 * Reconhecimento de receita na entrega (CPC 47): quando a minuta fica ENTREGUE,
 * nasce o recebível e a receita, e baixa-se o backlog (Bens a Entregar /
 * Material a Entregar) pela fração entregue. Por item, o valor entregue é
 * proporcional à fração entregue (qtd minuta ÷ qtd pedido):
 *   D Clientes a Receber (líquido) · D (-) Descontos Concedidos (desconto) · C Receita Bruta (bruto)
 *   D Material a Entregar (líquido) · C Bens a Entregar (líquido)   [baixa do backlog]
 * Líquido = valorTotal do item (autoritativo); desconto = valorDesconto; bruto = líquido+desconto.
 * O recebível nasce aqui (não na confirmação) para o contábil convergir com o
 * financeiro (título gerado na entrega). Idempotente por (empresa, RECEITA_ENTREGA, minutaId).
 */
export async function contabilizarReceitaMinuta(minutaId: string) {
  const minuta = await prismaSemEscopo.minuta.findUnique({
    where: { id: minutaId },
    select: {
      id: true, empresaId: true, numero: true, status: true, dataEntrega: true, dataEmissao: true, createdAt: true, pedidoVendaId: true,
      pedidoVenda: { select: { numero: true, clienteId: true, cliente: { select: { razaoSocial: true } }, contasReceber: { select: { numero: true } } } },
      itens: { select: { quantidade: true, item: { select: { descricao: true } }, pedidoVendaItem: { select: { quantidade: true, precoUnitario: true, valorTotal: true, valorDesconto: true } } } },
    },
  });
  if (!minuta || minuta.status !== "ENTREGUE") return;

  // Líquido e desconto entregues, proporcionais à fração entregue de cada item.
  let liquido = 0, desconto = 0;
  for (const it of minuta.itens) {
    const pvi = it.pedidoVendaItem;
    if (!pvi) continue;
    const qPed = decimalToNumber(pvi.quantidade);
    if (qPed <= 0) continue;
    const frac = decimalToNumber(it.quantidade) / qPed;
    liquido += decimalToNumber(pvi.valorTotal) * frac;
    desconto += decimalToNumber(pvi.valorDesconto) * frac;
  }
  liquido = Math.round(liquido * 100) / 100;
  desconto = Math.round(desconto * 100) / 100;
  const bruto = Math.round((liquido + desconto) * 100) / 100;
  if (bruto <= 0.005) return;

  const clienteId = minuta.pedidoVenda?.clienteId ?? null;
  const [contaMat, contaReceita, contaDesc] = await Promise.all([
    clienteId ? garantirContaMaterialEntregarCliente(minuta.empresaId, clienteId) : garantirContaMaterialEntregar(minuta.empresaId),
    garantirContaReceitaFallback(minuta.empresaId),                 // Receita BRUTA unificada (3.1.9002)
    desconto > 0.005 ? garantirContaDescontoConcedido(minuta.empresaId) : Promise.resolve(null),
  ]);
  if (!contaMat || !contaReceita) return;

  // Histórico no padrão do razão: minuta · pedido · CR(s) · cliente · itens entregues.
  const detalhe = detalheItens(minuta.itens.map((it) => ({
    quantidade: it.quantidade, precoUnitario: it.pedidoVendaItem?.precoUnitario, item: it.item,
  })));
  const pedNum = minuta.pedidoVenda?.numero;
  const crNums = (minuta.pedidoVenda?.contasReceber ?? []).map((c) => c.numero).join(", ");
  const cli = minuta.pedidoVenda?.cliente?.razaoSocial ?? "";
  const hist = `Receita na entrega — Minuta ${minuta.numero}`
    + (pedNum ? ` · Pedido ${pedNum}` : "")
    + (crNums ? ` · ${crNums}` : "")
    + (cli ? ` · ${cli}` : "")
    + (detalhe ? ` · ${detalhe}` : "");
  // Reconhecimento de receita na entrega (CPC 47): baixa o passivo Material a
  // Entregar (líquido) e credita a Receita BRUTA, separando o desconto na conta
  // redutora. O RECEBÍVEL não nasce aqui — nasce com o título (ver
  // contabilizarTituloReceber), para o contábil bater com o financeiro.
  const partidas: PartidaIn[] = [
    { contaId: contaMat.id, tipo: "DEBITO", valor: liquido, clienteId },
    { contaId: contaReceita.id, tipo: "CREDITO", valor: bruto },
  ];
  if (desconto > 0.005 && contaDesc) {
    partidas.push({ contaId: contaDesc.id, tipo: "DEBITO", valor: desconto });
  } else if (desconto > 0.005) {
    // sem conta de desconto resolvida: receita pelo líquido (não desbalancear)
    partidas[1] = { contaId: contaReceita.id, tipo: "CREDITO", valor: liquido };
  }

  await registrarLancamento({
    empresaId: minuta.empresaId, data: minuta.dataEntrega ?? minuta.dataEmissao ?? minuta.createdAt,
    historico: hist, origemTipo: "RECEITA_ENTREGA", origemId: minuta.id,
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
 * Produção (PCP): transformação entre contas de ESTOQUE (matéria-prima → WIP por
 * estado → produto acabado). Não toca resultado — o P&L só aparece no CPV da venda.
 * Lança como transferência: D conta do local que recebe / C do local que cede, ao
 * CMPM de cada item (WIP/acabado já custeados fase a fase pelo apontamento).
 * Só ao concluir a ordem. Idempotente por (empresa, ESTOQUE_PRODUCAO, ordemId).
 */
export async function contabilizarProducaoOrdem(ordemId: string) {
  const ordem = await prismaSemEscopo.ordemProducao.findUnique({
    where: { id: ordemId },
    select: { id: true, numero: true, status: true, updatedAt: true },
  });
  if (!ordem || ordem.status !== "CONCLUIDA") return;

  const movs = await prismaSemEscopo.movimentacaoEstoque.findMany({
    where: { ordemProducaoId: ordemId, localEstoqueId: { not: null }, clienteDonoId: null, tipo: { in: ["ENTRADA", "SAIDA"] } },
    select: { itemId: true, localEstoqueId: true, tipo: true, quantidade: true, empresaId: true },
  });
  if (movs.length === 0) return;
  const empresaId = movs[0].empresaId;

  await postMovimentosEstoque({
    empresaId, data: ordem.updatedAt, historico: `Produção — ${ordem.numero}`,
    origemTipo: "ESTOQUE_PRODUCAO", origemId: ordemId,
    movs, semContrapartida: true,
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
    select: { itemId: true, localEstoqueId: true, tipo: true, quantidade: true, empresaId: true, valorUnitario: true, item: { select: { descricao: true } } },
  });
  if (movs.length === 0) return;
  const empresaId = movs[0].empresaId;
  const { consumoId } = await garantirContasSistemaEstoque(empresaId);

  // Detalhe dos itens (qtd× produto × R$ unit) p/ identificar o que foi requisitado.
  const detItens = agruparItensParaDetalhe(movs);

  await postMovimentosEstoque({
    empresaId, data: req.updatedAt, historico: `Requisição — ${req.numero}${detItens ? ` — ${detItens}` : ""}`,
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

// Categorias governadas pelo PCP (custo por absorção): ficam de fora da
// reconciliação ao físico — o valor delas é construído pelas transformações
// (matéria-prima → WIP → produto acabado), não pelo CMPM.
const CATEGORIAS_PCP = new Set(["PRODUTO_ACABADO", "WIP"]);

export type ReconciliacaoEstoqueLocal = {
  localId: string;
  localNome: string;
  fisico: number;
  contabilAntes: number;
  ajuste: number; // diff aplicado (físico − contábil); 0 = nada a fazer
  // "revisar" = divergência acima do limite automático (não lançada — sinalizada
  // para conferência humana; em geral indica deslocação/erro estrutural, não drift).
  tipo: "sobra" | "perda" | "ok" | "revisar";
};

/**
 * Reconcilia o saldo CONTÁBIL de cada local de estoque ao FÍSICO (Σ qtd × CMPM),
 * postando um ESTOQUE_AJUSTE por local: sobra D Estoque / C Sobras (3.1.9001);
 * perda D Perdas (3.3.9002) / C Estoque. Locais de Produto Acabado / WIP ficam de
 * fora (custeio por absorção via PCP). Idempotente por dia (origemId com a data):
 * re-rodar no mesmo dia não duplica; após nova divergência, re-sincroniza o delta.
 */
export async function reconciliarEstoqueAoFisico(
  empresaId: string,
  opts?: { soLocalId?: string; data?: Date; criadoPor?: string | null; limiteAuto?: number },
): Promise<ReconciliacaoEstoqueLocal[]> {
  const data = opts?.data ?? new Date();
  const ymd = `${data.getFullYear()}${String(data.getMonth() + 1).padStart(2, "0")}${String(data.getDate()).padStart(2, "0")}`;

  const locais = await prismaSemEscopo.localEstoque.findMany({
    where: { empresaId, ativo: true, ...(opts?.soLocalId ? { id: opts.soLocalId } : {}) },
    select: { id: true, nome: true, categoriasAceitas: true },
  });
  if (locais.length === 0) return [];

  const contas = await prismaSemEscopo.contaContabil.findMany({
    where: { empresaId, localEstoqueId: { in: locais.map((l) => l.id) } },
    select: { id: true, localEstoqueId: true },
  });
  const contaPorLocal = new Map(contas.map((c) => [c.localEstoqueId!, c.id]));
  const { sobrasId, perdasId } = await garantirContasSistemaEstoque(empresaId);

  const resultados: ReconciliacaoEstoqueLocal[] = [];
  for (const local of locais) {
    const contaId = contaPorLocal.get(local.id);
    if (!contaId) continue; // sem conta vinculada → não reconcilia
    // Pula locais governados pelo PCP (Produto Acabado / WIP).
    if (local.categoriasAceitas.some((c) => CATEGORIAS_PCP.has(c))) continue;

    // Físico = Σ qtd × valor unitário (custo); ignora itens de categoria PCP.
    const estoques = await prismaSemEscopo.estoqueItem.findMany({
      where: { empresaId, localEstoqueId: local.id, clienteDonoId: null },
      select: { itemId: true, quantidadeAtual: true },
    });
    const valores = await valoresEstoqueDaEmpresa(empresaId, estoques.map((e) => e.itemId));
    let fisico = 0;
    for (const e of estoques) {
      const vi = valores.get(e.itemId);
      if (!vi || (vi.categoria && CATEGORIAS_PCP.has(vi.categoria))) continue;
      fisico += decimalToNumber(e.quantidadeAtual) * vi.valorUnitario;
    }
    fisico = Math.round(fisico * 100) / 100;

    // Contábil = saldo atual da conta (débito − crédito).
    const grupos = await prismaSemEscopo.partidaContabil.groupBy({
      by: ["tipo"], where: { contaId }, _sum: { valor: true },
    });
    let contabil = 0;
    for (const g of grupos) {
      const v = decimalToNumber(g._sum.valor ?? 0);
      contabil += g.tipo === "DEBITO" ? v : -v;
    }
    contabil = Math.round(contabil * 100) / 100;

    const diff = Math.round((fisico - contabil) * 100) / 100;
    if (Math.abs(diff) <= 0.01) {
      resultados.push({ localId: local.id, localNome: local.nome, fisico, contabilAntes: contabil, ajuste: 0, tipo: "ok" });
      continue;
    }
    // Trava do modo automático: divergência grande não é lançada às cegas —
    // costuma ser deslocação/erro estrutural (ex.: valor na conta errada), não
    // drift de custeio. Sinaliza p/ revisão humana.
    if (opts?.limiteAuto != null && Math.abs(diff) > opts.limiteAuto) {
      resultados.push({ localId: local.id, localNome: local.nome, fisico, contabilAntes: contabil, ajuste: diff, tipo: "revisar" });
      continue;
    }

    // Sobra (físico > contábil): D Estoque / C Sobras. Perda: D Perdas / C Estoque.
    if (diff > 0 && !sobrasId) continue;
    if (diff < 0 && !perdasId) continue;
    const partidas: PartidaIn[] = diff > 0
      ? [{ contaId, tipo: "DEBITO", valor: diff }, { contaId: sobrasId!, tipo: "CREDITO", valor: diff }]
      : [{ contaId: perdasId!, tipo: "DEBITO", valor: -diff }, { contaId, tipo: "CREDITO", valor: -diff }];

    await registrarLancamento({
      empresaId, data,
      historico: `Reconciliação do estoque ao físico — ${local.nome} (${diff > 0 ? "sobra" : "perda"} de R$ ${Math.abs(diff).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`,
      origemTipo: "ESTOQUE_AJUSTE", origemId: `reconc-estoque-${local.id}-${ymd}`,
      criadoPor: opts?.criadoPor ?? null,
      partidas,
    });
    resultados.push({ localId: local.id, localNome: local.nome, fisico, contabilAntes: contabil, ajuste: diff, tipo: diff > 0 ? "sobra" : "perda" });
  }
  return resultados;
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
