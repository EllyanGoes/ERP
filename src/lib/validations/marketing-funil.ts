import { z } from "zod";

export const TIPOS_FUNIL_NO = ["FONTE", "PAGINA", "ACAO", "ETAPA_OFFLINE"] as const;
export type TipoFunilNo = (typeof TIPOS_FUNIL_NO)[number];

// node.data do React Flow — o que persiste no canvas e é espelhado em FunilNo.
// Campos por tipo:
//   FONTE         → plataforma, campanhaId
//   PAGINA        → urlPatterns (glob simples com *)
//   ACAO          → eventoNome
//   ETAPA_OFFLINE → etapaLeadId, vinculoErp (Fase 4)
// valorMedio: ticket médio do nó p/ receita projetada no forecast.
export const funilNoDataSchema = z.object({
  tipo: z.enum(TIPOS_FUNIL_NO),
  rotulo: z.string().min(1),
  plataforma: z.string().optional().nullable(),
  campanhaId: z.string().optional().nullable(),
  urlPatterns: z.array(z.string()).optional(),
  eventoNome: z.string().optional().nullable(),
  etapaLeadId: z.string().optional().nullable(),
  vinculoErp: z
    .object({
      tipo: z.enum(["PEDIDO_VENDA", "CLIENTE_NOVO"]),
      filtros: z.record(z.string(), z.unknown()).optional(),
    })
    .optional()
    .nullable(),
  // Forecast por nó
  volume: z.number().nonnegative().optional().nullable(), // nós FONTE: entrada projetada
  valorMedio: z.number().nonnegative().optional().nullable(),
});

export type FunilNoData = z.infer<typeof funilNoDataSchema>;

// Estrutura mínima do grafo do React Flow que persistimos. `passthrough`
// preserva campos do React Flow que não validamos (selected, measured, ...).
export const funilCanvasSchema = z.object({
  nodes: z.array(
    z
      .object({
        id: z.string().min(1),
        type: z.string().optional(),
        position: z.object({ x: z.number(), y: z.number() }),
        data: funilNoDataSchema,
      })
      .passthrough()
  ),
  edges: z.array(
    z
      .object({
        id: z.string().min(1),
        source: z.string().min(1),
        target: z.string().min(1),
        data: z
          .object({ taxa: z.number().min(0).max(100).optional().nullable() })
          .passthrough()
          .optional(),
      })
      .passthrough()
  ),
});

export type FunilCanvas = z.infer<typeof funilCanvasSchema>;

export const funilSchema = z.object({
  nome: z.string().min(2, "Nome do funil é obrigatório"),
  descricao: z.string().optional().nullable(),
  status: z.enum(["RASCUNHO", "ATIVO", "ARQUIVADO"]).optional(),
});

export type FunilFormData = z.infer<typeof funilSchema>;

// PUT do funil — metadados e/ou canvas (o canvas sincroniza FunilNo na API).
export const funilUpdateSchema = funilSchema.partial().extend({
  canvas: funilCanvasSchema.optional(),
  forecast: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type FunilUpdateData = z.infer<typeof funilUpdateSchema>;

export const lancamentoManualSchema = z
  .object({
    noId: z.string().min(1, "Selecione o nó"),
    dataInicio: z.string().min(1, "Informe o início do período"), // ISO
    dataFim: z.string().min(1, "Informe o fim do período"),
    visitantes: z.coerce.number().int().nonnegative().optional().nullable(),
    leads: z.coerce.number().int().nonnegative().optional().nullable(),
    conversoes: z.coerce.number().int().nonnegative().optional().nullable(),
    receita: z.coerce.number().nonnegative().optional().nullable(),
    observacao: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (
      data.visitantes == null &&
      data.leads == null &&
      data.conversoes == null &&
      data.receita == null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visitantes"],
        message: "Informe ao menos uma métrica.",
      });
    }
    if (data.dataFim < data.dataInicio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataFim"],
        message: "Período inválido: fim antes do início.",
      });
    }
  });

export type LancamentoManualData = z.infer<typeof lancamentoManualSchema>;
