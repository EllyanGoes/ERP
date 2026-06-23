import { z } from "zod";

export const concorrenteSchema = z.object({
  tipoPessoa: z.enum(["FISICA", "JURIDICA"]),
  razaoSocial: z.string().min(2, "Nome / Razão Social é obrigatório"),
  nomeFantasia: z.string().optional().nullable(),
  cpfCnpj: z.string().max(18, "CPF/CNPJ inválido").optional().nullable(),

  ehFornecedor: z.boolean(),
  ehRevendedor: z.boolean(),

  email: z.string().email("E-mail inválido").optional().nullable().or(z.literal("")),
  telefone: z.string().optional().nullable(),
  celular: z.string().optional().nullable(),
  site: z.string().optional().nullable(),

  cep: z.string().optional().nullable(),
  logradouro: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  complemento: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  estado: z.string().max(2).optional().nullable(),

  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),

  observacoes: z.string().optional().nullable(),
  ativo: z.boolean(),
}).superRefine((data, ctx) => {
  if (!data.ehFornecedor && !data.ehRevendedor) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ehFornecedor"],
      message: "Marque ao menos uma categoria: fornecedor e/ou revendedor.",
    });
  }
});

export type ConcorrenteFormData = z.infer<typeof concorrenteSchema>;

export const concorrentePrecoSchema = z.object({
  itemId: z.string().optional().nullable(),
  produtoNome: z.string().min(1, "Informe o produto"),
  preco: z.coerce.number().nonnegative("Preço inválido"),
  unidade: z.string().optional().nullable(),
  dataColeta: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

export type ConcorrentePrecoFormData = z.infer<typeof concorrentePrecoSchema>;
