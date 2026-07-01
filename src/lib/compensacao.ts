import { prismaSemEscopo } from "@/lib/prisma";
import { garantirContaContabilBanco } from "@/lib/conta-contabil";
import { decimalToNumber } from "@/lib/utils";

// Encontro de Contas (AP-AR netting): liquida títulos a RECEBER contra títulos a
// PAGAR do MESMO parceiro externo (mesmo CNPJ, cliente e fornecedor da mesma
// empresa) SEM caixa. As baixas dos dois lados passam pela conta bancária
// TRANSITÓRIA de compensação (que zera), reusando o fluxo de baixa/contabilização
// existente. O efeito líquido no razão é D Fornecedores / C Clientes pelo min.

// Status de título com saldo em aberto (não quitado nem cancelado).
export const STATUS_ABERTOS = ["ABERTA", "PARCIAL", "VENCIDA"] as const;

export function soDigitos(v?: string | null): string {
  return (v ?? "").replace(/\D/g, "");
}

export function saldoTitulo(t: { valorOriginal: unknown; valorPago: unknown }): number {
  return Math.round((decimalToNumber(t.valorOriginal) - decimalToNumber(t.valorPago)) * 100) / 100;
}

/**
 * Garante (idempotente) a conta bancária TRANSITÓRIA de compensação da empresa e
 * a sua analítica contábil (sob 1.1.1, via garantirContaContabilBanco). Retorna a
 * ContaBancaria. É o "banco" por onde as baixas da compensação passam e zeram.
 */
export async function garantirContaCompensacao(empresaId: string) {
  let cb = await prismaSemEscopo.contaBancaria.findFirst({ where: { empresaId, compensacao: true } });
  if (!cb) {
    cb = await prismaSemEscopo.contaBancaria.create({
      data: { empresaId, nome: "Compensações a liquidar", compensacao: true, ativo: true },
    });
  }
  await garantirContaContabilBanco(cb.id).catch(() => null);
  return cb;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export type TituloSaldo = { id: string; saldo: number; dataVencimento?: Date | null };
export type AlocacaoTitulo = { id: string; aplicado: number };
export type Alocacao = {
  min: number;
  sumR: number;
  sumP: number;
  maiorLado: "RECEBER" | "PAGAR";
  residual: number;
  aplicR: AlocacaoTitulo[];
  aplicP: AlocacaoTitulo[];
};

/**
 * Aloca a compensação sobre os títulos selecionados. O lado MENOR é quitado
 * integralmente (Σ = min). No modo PARCIAL o lado maior é preenchido só até o min
 * (na ordem dada) e o resto fica aberto. No modo NOVA_PARCELA os dois lados são
 * quitados 100% e o resíduo (|ΣR − ΣP|) vira um título novo no lado maior.
 * Retorna null se não há o que compensar (min ≤ 0).
 */
export function calcularAlocacao(
  receber: TituloSaldo[],
  pagar: TituloSaldo[],
  modo: "PARCIAL" | "NOVA_PARCELA",
): Alocacao | null {
  const sumR = r2(receber.reduce((s, t) => s + t.saldo, 0));
  const sumP = r2(pagar.reduce((s, t) => s + t.saldo, 0));
  const min = Math.min(sumR, sumP);
  if (min <= 0.005) return null;
  const maiorLado: "RECEBER" | "PAGAR" = sumR >= sumP ? "RECEBER" : "PAGAR";
  const residual = r2(Math.abs(sumR - sumP));

  const cheio = (list: TituloSaldo[]): AlocacaoTitulo[] => list.map((t) => ({ id: t.id, aplicado: r2(t.saldo) }));
  const preencher = (list: TituloSaldo[], alvo: number): AlocacaoTitulo[] => {
    let rem = alvo;
    return list.map((t) => {
      const a = r2(Math.min(t.saldo, Math.max(0, rem)));
      rem = r2(rem - a);
      return { id: t.id, aplicado: a };
    });
  };

  let aplicR: AlocacaoTitulo[];
  let aplicP: AlocacaoTitulo[];
  if (modo === "NOVA_PARCELA") {
    aplicR = cheio(receber);
    aplicP = cheio(pagar);
  } else if (maiorLado === "RECEBER") {
    aplicP = cheio(pagar);
    aplicR = preencher(receber, min);
  } else {
    aplicR = cheio(receber);
    aplicP = preencher(pagar, min);
  }
  return {
    min: r2(min),
    sumR,
    sumP,
    maiorLado,
    residual,
    aplicR: aplicR.filter((x) => x.aplicado > 0.005),
    aplicP: aplicP.filter((x) => x.aplicado > 0.005),
  };
}

export type ParceiroElegivel = {
  cpfCnpj: string;
  nome: string;
  clienteId: string;
  fornecedorId: string;
  totalReceber: number;
  totalPagar: number;
  minCompensavel: number;
};

/**
 * Parceiros elegíveis a compensação na empresa: os que têm, ao mesmo tempo, um
 * Cliente com título a RECEBER em aberto e um Fornecedor com título a PAGAR em
 * aberto sob o MESMO CNPJ (comparado por dígitos). Ignora intragrupo.
 */
export async function parceirosElegiveisCompensacao(empresaId: string): Promise<ParceiroElegivel[]> {
  const [crs, cps] = await Promise.all([
    prismaSemEscopo.contaReceber.findMany({
      where: { empresaId, intragrupo: false, status: { in: [...STATUS_ABERTOS] }, clienteId: { not: null } },
      select: { valorOriginal: true, valorPago: true, clienteId: true, cliente: { select: { id: true, razaoSocial: true, cpfCnpj: true } } },
    }),
    prismaSemEscopo.contaPagar.findMany({
      where: { empresaId, intragrupo: false, status: { in: [...STATUS_ABERTOS] }, fornecedorId: { not: null } },
      select: { valorOriginal: true, valorPago: true, fornecedorId: true, fornecedor: { select: { id: true, razaoSocial: true, cpfCnpj: true } } },
    }),
  ]);

  type Lado = { total: number; id: string; nome: string };
  const receber = new Map<string, Lado>();
  for (const cr of crs) {
    const dig = soDigitos(cr.cliente?.cpfCnpj);
    if (dig.length < 11 || !cr.clienteId) continue;
    const s = saldoTitulo(cr);
    if (s <= 0.005) continue;
    const cur = receber.get(dig);
    if (cur) cur.total += s;
    else receber.set(dig, { total: s, id: cr.clienteId, nome: cr.cliente?.razaoSocial ?? "" });
  }
  const pagar = new Map<string, Lado>();
  for (const cp of cps) {
    const dig = soDigitos(cp.fornecedor?.cpfCnpj);
    if (dig.length < 11 || !cp.fornecedorId) continue;
    const s = saldoTitulo(cp);
    if (s <= 0.005) continue;
    const cur = pagar.get(dig);
    if (cur) cur.total += s;
    else pagar.set(dig, { total: s, id: cp.fornecedorId, nome: cp.fornecedor?.razaoSocial ?? "" });
  }

  const out: ParceiroElegivel[] = [];
  for (const [dig, r] of Array.from(receber.entries())) {
    const p = pagar.get(dig);
    if (!p) continue;
    const totalReceber = Math.round(r.total * 100) / 100;
    const totalPagar = Math.round(p.total * 100) / 100;
    out.push({
      cpfCnpj: dig,
      nome: r.nome || p.nome,
      clienteId: r.id,
      fornecedorId: p.id,
      totalReceber,
      totalPagar,
      minCompensavel: Math.min(totalReceber, totalPagar),
    });
  }
  return out.sort((a, b) => b.minCompensavel - a.minCompensavel);
}

/**
 * Títulos em aberto (a receber e a pagar) de um parceiro na empresa, para a tela
 * de seleção. Casa por dígitos do CNPJ.
 */
export async function titulosAbertosDoParceiro(empresaId: string, cpfCnpjDigitos: string) {
  const dig = soDigitos(cpfCnpjDigitos);
  const [crs, cps] = await Promise.all([
    prismaSemEscopo.contaReceber.findMany({
      where: { empresaId, intragrupo: false, status: { in: [...STATUS_ABERTOS] }, clienteId: { not: null } },
      select: { id: true, numero: true, descricao: true, valorOriginal: true, valorPago: true, dataVencimento: true, cliente: { select: { cpfCnpj: true } } },
      orderBy: { dataVencimento: "asc" },
    }),
    prismaSemEscopo.contaPagar.findMany({
      where: { empresaId, intragrupo: false, status: { in: [...STATUS_ABERTOS] }, fornecedorId: { not: null } },
      select: { id: true, numero: true, descricao: true, valorOriginal: true, valorPago: true, dataVencimento: true, fornecedor: { select: { cpfCnpj: true } } },
      orderBy: { dataVencimento: "asc" },
    }),
  ]);
  const receber = crs
    .filter((c) => soDigitos(c.cliente?.cpfCnpj) === dig && saldoTitulo(c) > 0.005)
    .map((c) => ({ id: c.id, numero: c.numero, descricao: c.descricao, dataVencimento: c.dataVencimento, saldo: saldoTitulo(c) }));
  const pagar = cps
    .filter((c) => soDigitos(c.fornecedor?.cpfCnpj) === dig && saldoTitulo(c) > 0.005)
    .map((c) => ({ id: c.id, numero: c.numero, descricao: c.descricao, dataVencimento: c.dataVencimento, saldo: saldoTitulo(c) }));
  return { receber, pagar };
}
