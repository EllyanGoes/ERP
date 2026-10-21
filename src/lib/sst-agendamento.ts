// SST — agendamento de exames com a clínica: regras comuns às rotas
// (dados da clínica, tabela de preço, preço de cada exame no agendamento).
import type { Prisma } from "@prisma/client";

export const PERIODOS = ["MANHA", "TARDE"] as const;
export const STATUS_AGENDAMENTO = ["AGENDADO", "CONFIRMADO", "REALIZADO", "FALTOU", "CANCELADO"] as const;
export const TIPOS_ASO_AGENDAVEIS = ["ADMISSIONAL", "PERIODICO", "RETORNO", "MUDANCA_FUNCAO", "MUDANCA_RISCO", "DEMISSIONAL"] as const;
/** Agendamento "em aberto": ainda vai à clínica (não some da agenda nem volta para as sugestões). */
export const STATUS_ABERTOS = ["AGENDADO", "CONFIRMADO"];

export const CLINICA_INCLUDE = {
  fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
  precos: { select: { exameTipoId: true, preco: true } },
  _count: { select: { agendamentos: true } },
} as const;

export const AGENDAMENTO_INCLUDE = {
  empresa: { select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true, logradouro: true, numero: true, bairro: true, cidade: true, estado: true, telefone: true } },
  clinica: { select: { id: true, nome: true, endereco: true, telefone: true } },
  lote: { select: { id: true, numero: true } },
  aso: { select: { id: true, tipo: true, data: true, resultado: true, documentoId: true } },
  exames: { select: { exameTipoId: true, preco: true, exameTipo: { select: { nome: true, clinico: true } } } },
  colaborador: {
    select: {
      id: true, nome: true, cpf: true, matricula: true, dataAdmissao: true, cargo: true,
      setor: { select: { nome: true } },
      sstFuncoes: { where: { fim: null }, take: 1, orderBy: { inicio: "desc" as const }, select: { funcao: { select: { nome: true, ghe: true } } } },
    },
  },
} as const;

const texto = (v: unknown) => { const s = String(v ?? "").trim(); return s || null; };

/** Campos editáveis da clínica (só os que vieram no corpo). */
export function dadosClinica(b: Record<string, unknown>) {
  const out: { nome?: string | null; fornecedorId?: string | null; cnpj?: string | null; endereco?: string | null; telefone?: string | null; email?: string | null; contato?: string | null; observacoes?: string | null } = {};
  for (const k of ["nome", "fornecedorId", "cnpj", "endereco", "telefone", "email", "contato", "observacoes"] as const) if (k in b) out[k] = texto(b[k]);
  return out;
}

/** Substitui a tabela de preços da clínica (linhas sem preço = usa o preço de referência do exame). */
export async function salvarPrecosClinica(tx: Prisma.TransactionClient, clinicaId: string, precos: unknown) {
  if (!Array.isArray(precos)) return;
  const linhas = precos
    .map((p: { exameTipoId?: string; preco?: unknown }) => ({ exameTipoId: String(p?.exameTipoId ?? ""), preco: Number(String(p?.preco ?? "").replace(",", ".")) }))
    .filter((p) => p.exameTipoId && Number.isFinite(p.preco) && p.preco > 0);
  await tx.sstClinicaPreco.deleteMany({ where: { clinicaId } });
  if (linhas.length) await tx.sstClinicaPreco.createMany({ data: linhas.map((p) => ({ clinicaId, ...p })) });
}

/** Preço de cada exame na clínica: tabela da clínica, senão o preço de referência do tipo. */
export async function precosParaClinica(tx: Prisma.TransactionClient, clinicaId: string, exameTipoIds: string[]) {
  const [daClinica, tipos] = await Promise.all([
    tx.sstClinicaPreco.findMany({ where: { clinicaId, exameTipoId: { in: exameTipoIds } } }),
    tx.sstExameTipo.findMany({ where: { id: { in: exameTipoIds } }, select: { id: true, preco: true } }),
  ]);
  const mapa = new Map<string, Prisma.Decimal | null>(tipos.map((t) => [t.id, t.preco]));
  for (const p of daClinica) mapa.set(p.exameTipoId, p.preco);
  return mapa;
}
