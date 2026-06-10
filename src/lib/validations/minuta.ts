import { z } from "zod"

// Validação focada no que pode corromper dados (itens e quantidades que viram
// movimentação de estoque). Os campos de logística (motorista, placa, etc.)
// continuam tratados de forma leniente pelas rotas — strings vazias viram null.
export const minutaItemSchema = z.object({
  pedidoVendaItemId: z.string().min(1, "Item do pedido é obrigatório"),
  itemId:            z.string().min(1, "Item é obrigatório"),
  quantidade:        z.coerce.number().positive("Quantidade deve ser maior que zero"),
  quantidadeConvertida: z.coerce.number().positive().optional().nullable(),
  unidadeId:         z.string().optional().nullable(),
})

export const minutaItensSchema = z
  .array(minutaItemSchema)
  .min(1, "Informe ao menos um item")

export const minutaCreateSchema = z.object({
  pedidoVendaId: z.string().min(1, "pedidoVendaId é obrigatório"),
  itens:         minutaItensSchema,
})

export type MinutaItemData = z.infer<typeof minutaItemSchema>
