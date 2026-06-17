import { z } from "zod"

export const itemSchema = z.object({
  codigo: z.string().min(1, "Código é obrigatório"),
  descricao: z.string().min(2, "Descrição é obrigatória"),
  tipo: z.enum(["PRODUTO", "SERVICO", "MATERIA_PRIMA"]),
  categoriaEstoque: z.enum(["PRODUTO_ACABADO", "MERCADORIA", "WIP", "INSUMO", "ALMOXARIFADO"]).optional().nullable(),
  unidadeMedida: z.enum(["UN", "KG", "LT", "MT", "CX", "PC", "HR"]),
  ncm: z.string().optional().nullable(),
  cest: z.string().optional().nullable(),
  precoVenda: z.coerce.number().min(0, "Preço de venda inválido"),
  precoCusto: z.coerce.number().min(0).optional().nullable(),
  pesoLiquido: z.coerce.number().min(0).optional().nullable(),
  pesoBruto: z.coerce.number().min(0).optional().nullable(),
  ativo: z.boolean().default(true),
  comodato: z.boolean().default(false),
  observacoes: z.string().optional().nullable(),
  quantidadeMin: z.coerce.number().min(0).optional().nullable(),
  quantidadeMax: z.coerce.number().min(0).optional().nullable(),
  localizacao: z.string().optional().nullable(),
})

export type ItemFormData = z.infer<typeof itemSchema>
