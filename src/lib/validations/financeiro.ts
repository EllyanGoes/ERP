import { z } from "zod"

export const contaReceberSchema = z.object({
  clienteId: z.string().min(1, "Cliente é obrigatório"),
  descricao: z.string().min(2, "Descrição é obrigatória"),
  valorOriginal: z.coerce.number().min(0.01, "Valor inválido"),
  dataVencimento: z.string().min(1, "Data de vencimento é obrigatória"),
  formaPagamento: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
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
})

export const pagamentoSchema = z.object({
  valorPago: z.coerce.number().min(0.01, "Valor inválido"),
  dataPagamento: z.string().min(1, "Data é obrigatória"),
  formaPagamento: z.string().optional().nullable(),
  valorMulta: z.coerce.number().min(0).default(0),
  valorJuros: z.coerce.number().min(0).default(0),
})

export type ContaReceberFormData = z.infer<typeof contaReceberSchema>
export type ContaPagarFormData = z.infer<typeof contaPagarSchema>
export type PagamentoFormData = z.infer<typeof pagamentoSchema>
