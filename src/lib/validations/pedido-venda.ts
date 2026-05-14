import { z } from "zod"

export const pedidoVendaItemSchema = z.object({
  itemId: z.string().min(1, "Item é obrigatório"),
  quantidade: z.coerce.number().min(0.001, "Quantidade inválida"),
  precoUnitario: z.coerce.number().min(0, "Preço inválido"),
  desconto: z.coerce.number().min(0).default(0),
  valorTotal: z.coerce.number().min(0),
})

export const pedidoVendaSchema = z.object({
  clienteId: z.string().min(1, "Cliente é obrigatório"),
  dataEmissao: z.string().or(z.date()),
  dataEntrega: z.string().optional().nullable(),
  condicaoPagamento: z.string().optional().nullable(),
  valorDesconto: z.coerce.number().min(0).default(0),
  valorFrete: z.coerce.number().min(0).default(0),
  observacoes: z.string().optional().nullable(),
  itens: z.array(pedidoVendaItemSchema).min(1, "Adicione pelo menos um item"),
})

export type PedidoVendaFormData = z.infer<typeof pedidoVendaSchema>
export type PedidoVendaItemFormData = z.infer<typeof pedidoVendaItemSchema>
