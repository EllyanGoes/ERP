import { z } from "zod"

export const pedidoVendaItemSchema = z.object({
  itemId:        z.string().min(1, "Item é obrigatório"),
  quantidade:    z.coerce.number().min(0.001, "Quantidade inválida"),
  precoUnitario: z.coerce.number().min(0, "Preço inválido"),
  precoTransferencia: z.coerce.number().min(0).optional(),       // venda à ordem: preço de compra (origem)
  // Venda à ordem POR ITEM: origem do estoque desta linha (sobrepõe a origem
  // padrão do pedido). Só válida com a origem padrão preenchida (à ordem ativo).
  estoqueOrigemEmpresaId: z.string().optional().nullable().transform((v) => v || null),
  descontoPct:   z.coerce.number().min(0).max(100).default(0),   // % desconto
  valorDesconto: z.coerce.number().min(0).default(0),            // R$ calculado
  desconto:      z.coerce.number().min(0).default(0),            // compat
  valorTotal:    z.coerce.number().min(0),
})

export const pedidoVendaPagamentoSchema = z.object({
  forma: z.string().min(1),
  valor: z.coerce.number().min(0),
  // Conta de destino do recebimento. Só é editável (e enviada) ao editar um
  // pedido JÁ pago — nos demais casos o pagamento é só intenção (sem conta).
  contaBancariaId: z.string().optional().nullable().transform((v) => v || null),
})

export const pedidoVendaSchema = z.object({
  clienteId:         z.string().min(1, "Cliente é obrigatório"),
  modalidade:        z.enum(["BALCAO", "AGENDADA"]).optional(), // legado: derivado de necessidadeEntrega
  necessidadePagamento: z.enum(["A_VISTA", "A_PRAZO"]).optional(),
  necessidadeEntrega:   z.enum(["RETIRADA", "ENTREGA"]).optional(),
  pagamentos:        z.array(pedidoVendaPagamentoSchema).optional(),
  // Data do recebimento (YYYY-MM-DD) — só aplicada ao editar pedido já pago.
  pagamentoData:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  numeroOrcamento:   z.string().optional().nullable(),
  tabelaPrecoId:     z.string().optional().nullable(),
  vendedorId:        z.string().optional().nullable().transform((v) => v || null),
  dataEmissao:       z.string().or(z.date()),
  dataEntrega:       z.string().optional().nullable(),
  condicaoPagamento: z.string().optional().nullable(),
  condicaoPagamentoId: z.string().optional().nullable().transform((v) => v || null),
  naturezaFinanceiraId: z.string().optional().nullable().transform((v) => v || null),
  formaPagamento:    z.string().optional().nullable(),
  valorDesconto:     z.coerce.number().min(0).default(0),
  valorFrete:        z.coerce.number().min(0).default(0),
  observacoes:       z.string().optional().nullable(),
  itens:             z.array(pedidoVendaItemSchema).min(1, "Adicione pelo menos um item"),
})

export type PedidoVendaFormData = z.infer<typeof pedidoVendaSchema>
export type PedidoVendaItemFormData = z.infer<typeof pedidoVendaItemSchema>
