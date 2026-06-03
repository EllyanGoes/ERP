import { z } from "zod"

export const contaReceberSchema = z.object({
  clienteId: z.string().min(1, "Cliente é obrigatório"),
  descricao: z.string().min(2, "Descrição é obrigatória"),
  valorOriginal: z.coerce.number().min(0.01, "Valor inválido"),
  dataVencimento: z.string().min(1, "Data de vencimento é obrigatória"),
  formaPagamento: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
  categoriaFinanceiraId: z.string().optional().nullable(),
  centroCustoId: z.string().optional().nullable(),
  contaBancariaId: z.string().optional().nullable(),
})

export const contaPagarSchema = z.object({
  fornecedorId: z.string().optional().nullable(),
  descricao: z.string().min(2, "Descrição é obrigatória"),
  categoria: z.string().optional().nullable(),
  valorOriginal: z.coerce.number().min(0.01, "Valor inválido"),
  dataVencimento: z.string().min(1, "Data de vencimento é obrigatória"),
  formaPagamento: z.string().optional().nullable(),
  notaFiscal: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
  categoriaFinanceiraId: z.string().optional().nullable(),
  centroCustoId: z.string().optional().nullable(),
  contaBancariaId: z.string().optional().nullable(),
})

export const pagamentoSchema = z.object({
  valorPago: z.coerce.number().min(0.01, "Valor inválido"),
  dataPagamento: z.string().min(1, "Data é obrigatória"),
  formaPagamento: z.string().optional().nullable(),
  valorMulta: z.coerce.number().min(0).default(0),
  valorJuros: z.coerce.number().min(0).default(0),
  contaBancariaId: z.string().optional().nullable(),
})

// ── Tesouraria (Fase 1) ─────────────────────────────────────────────────────

export const bancoSchema = z.object({
  codigo: z.string().optional().nullable(),
  nome: z.string().min(2, "Nome é obrigatório"),
  ativo: z.boolean().default(true),
})

export const contaBancariaSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  bancoId: z.string().optional().nullable(),
  agencia: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  tipo: z.enum(["CORRENTE", "POUPANCA", "CAIXA"]).default("CORRENTE"),
  saldoInicial: z.coerce.number().default(0),
  ativo: z.boolean().default(true),
})

export const categoriaFinanceiraSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  tipo: z.enum(["RECEITA", "DESPESA"]),
  paiId: z.string().optional().nullable(),
  centroCustoId: z.string().optional().nullable(),
  ativo: z.boolean().default(true),
})

export const lancamentoFinanceiroSchema = z.object({
  tipo: z.enum(["RECEITA", "DESPESA"]),
  descricao: z.string().min(2, "Descrição é obrigatória"),
  valor: z.coerce.number().min(0.01, "Valor inválido"),
  dataLancamento: z.string().min(1, "Data é obrigatória"),
  contaBancariaId: z.string().min(1, "Conta bancária é obrigatória"),
  categoriaFinanceiraId: z.string().optional().nullable(),
  centroCustoId: z.string().optional().nullable(),
  favorecido: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
})

export const transferenciaSchema = z.object({
  contaOrigemId: z.string().min(1, "Conta de origem é obrigatória"),
  contaDestinoId: z.string().min(1, "Conta de destino é obrigatória"),
  valor: z.coerce.number().min(0.01, "Valor inválido"),
  dataLancamento: z.string().min(1, "Data é obrigatória"),
  descricao: z.string().optional().nullable(),
}).refine((d) => d.contaOrigemId !== d.contaDestinoId, {
  message: "Conta de origem e destino devem ser diferentes",
  path: ["contaDestinoId"],
})

export type ContaReceberFormData = z.infer<typeof contaReceberSchema>
export type ContaPagarFormData = z.infer<typeof contaPagarSchema>
export type PagamentoFormData = z.infer<typeof pagamentoSchema>
export type BancoFormData = z.infer<typeof bancoSchema>
export type ContaBancariaFormData = z.infer<typeof contaBancariaSchema>
export type CategoriaFinanceiraFormData = z.infer<typeof categoriaFinanceiraSchema>
export type LancamentoFinanceiroFormData = z.infer<typeof lancamentoFinanceiroSchema>
export type TransferenciaFormData = z.infer<typeof transferenciaSchema>
