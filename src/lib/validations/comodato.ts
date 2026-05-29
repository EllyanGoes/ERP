import { z } from "zod"

export const comodatoMovimentoSchema = z.object({
  clienteId:     z.string().min(1, "Cliente é obrigatório"),
  itemId:        z.string().min(1, "Item em Comodato é obrigatório"),
  tipo:          z.enum(["SAIDA", "RETORNO"]),
  quantidade:    z.coerce.number().positive("Quantidade deve ser maior que zero"),
  valorUnitario: z.coerce.number().min(0).optional(),
  data:          z.string().optional().nullable(),
  documento:     z.string().optional().nullable(),
  observacoes:   z.string().optional().nullable(),
  pedidoVendaId: z.string().optional().nullable(),
})

export type ComodatoMovimentoFormData = z.infer<typeof comodatoMovimentoSchema>
