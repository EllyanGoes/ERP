import { z } from "zod"

export const clienteSchema = z.object({
  tipoPessoa: z.enum(["FISICA", "JURIDICA"]),
  razaoSocial: z.string().min(2, "Razão Social é obrigatória"),
  nomeFantasia: z.string().optional().nullable(),
  cpfCnpj: z.string().min(11, "CPF/CNPJ inválido").max(18),
  ie: z.string().optional().nullable(),
  email: z.string().email("E-mail inválido").optional().nullable().or(z.literal("")),
  telefone: z.string().optional().nullable(),
  celular: z.string().optional().nullable(),
  status: z.enum(["ATIVO", "INATIVO", "PROSPECTO"]),
  observacoes: z.string().optional().nullable(),
  cep: z.string().optional().nullable(),
  logradouro: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  complemento: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  estado: z.string().max(2).optional().nullable(),
})

export type ClienteFormData = z.infer<typeof clienteSchema>
