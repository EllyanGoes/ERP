import { prismaSemEscopo } from "@/lib/prisma";

// Motor de lançamentos contábeis (partidas dobradas). Opera cross-empresa com
// empresaId explícito (cada empresa tem seu próprio plano de contas).

export type TipoPartidaIn = "DEBITO" | "CREDITO";
export type OrigemIn = "VENDA" | "RECEBIMENTO" | "COMPRA" | "PAGAMENTO" | "MANUAL" | "ESTORNO";

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
