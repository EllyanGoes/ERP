import { z } from "zod";

export const leadSchema = z.object({
  nome: z.string().min(2, "Nome do lead é obrigatório"),
  email: z.string().email("E-mail inválido").optional().nullable().or(z.literal("")),
  telefone: z.string().optional().nullable(),
  empresaNome: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  estado: z.string().max(2).optional().nullable(),
  valorEstimado: z.coerce.number().nonnegative("Valor inválido").optional().nullable(),
  campanhaId: z.string().optional().nullable(),
  origemLivre: z.string().optional().nullable(),
  funilId: z.string().optional().nullable(),
  etapaId: z.string().optional().nullable(),
  responsavelId: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
});

export type LeadFormData = z.infer<typeof leadSchema>;

// PATCH parcial — mover no kanban ({ etapaId }), marcar perdido, etc.
export const leadUpdateSchema = leadSchema.partial().extend({
  status: z.enum(["ABERTO", "GANHO", "PERDIDO"]).optional(),
  motivoPerda: z.string().optional().nullable(),
});

export type LeadUpdateData = z.infer<typeof leadUpdateSchema>;

// Conversão em Cliente: vincula um existente OU cria um novo pré-preenchido.
// Opcionalmente vincula o primeiro PedidoVenda.
export const leadConverterSchema = z
  .object({
    clienteId: z.string().optional().nullable(),
    criarCliente: z.boolean().optional(),
    pedidoVendaId: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.clienteId && !data.criarCliente) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clienteId"],
        message: "Vincule um cliente existente ou marque criar novo.",
      });
    }
  });

export type LeadConverterData = z.infer<typeof leadConverterSchema>;

export const leadEventoSchema = z.object({
  tipo: z.enum(["NOTA", "CONTATO"]),
  descricao: z.string().min(1, "Descreva o evento"),
});

export type LeadEventoData = z.infer<typeof leadEventoSchema>;

export const etapaLeadSchema = z.object({
  nome: z.string().min(1, "Nome da etapa é obrigatório"),
  ordem: z.coerce.number().int().optional(),
  cor: z.string().optional().nullable(),
  ganho: z.boolean().optional(),
  ativo: z.boolean().optional(),
});

export type EtapaLeadFormData = z.infer<typeof etapaLeadSchema>;
