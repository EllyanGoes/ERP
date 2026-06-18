import { z } from "zod"

export const clienteSchema = z.object({
  tipoPessoa: z.enum(["FISICA", "JURIDICA"]),
  razaoSocial: z.string().min(2, "Razão Social é obrigatória"),
  nomeFantasia: z.string().optional().nullable(),
  // CPF/CNPJ é obrigatório (validado em superRefine conforme o tipo de pessoa).
  cpfCnpj: z.string().max(18, "CPF/CNPJ inválido"),
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
}).superRefine((data, ctx) => {
  // CPF (11 dígitos) para pessoa física; CNPJ (14) para jurídica. Obrigatório.
  const digitos = (data.cpfCnpj ?? "").replace(/\D/g, "");
  if (!digitos) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ["cpfCnpj"],
      message: data.tipoPessoa === "FISICA" ? "CPF é obrigatório" : "CNPJ é obrigatório",
    });
    return;
  }
  if (data.tipoPessoa === "FISICA" && digitos.length !== 11) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cpfCnpj"], message: "CPF deve ter 11 dígitos" });
  }
  if (data.tipoPessoa === "JURIDICA" && digitos.length !== 14) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cpfCnpj"], message: "CNPJ deve ter 14 dígitos" });
  }
})

export type ClienteFormData = z.infer<typeof clienteSchema>
