import { z } from "zod";

// Plataformas conhecidas — `plataforma` é String livre no banco (novos canais
// sem migração); esta lista alimenta o select do form e os ícones/cores.
export const PLATAFORMAS_CAMPANHA = [
  "META",
  "GOOGLE",
  "TIKTOK",
  "ORGANICO",
  "INDICACAO",
  "WHATSAPP",
  "OUTRO",
] as const;

export const campanhaSchema = z.object({
  nome: z.string().min(2, "Nome da campanha é obrigatório"),
  plataforma: z.string().min(1, "Selecione a plataforma"),
  utmSource: z.string().optional().nullable(),
  utmMedium: z.string().optional().nullable(),
  utmCampaign: z.string().optional().nullable(),
  idExterno: z.string().optional().nullable(),
  orcamento: z.coerce.number().nonnegative("Orçamento inválido").optional().nullable(),
  dataInicio: z.string().optional().nullable(), // ISO (DatePicker padrão)
  dataFim: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
  ativo: z.boolean().optional(),
});

export type CampanhaFormData = z.infer<typeof campanhaSchema>;
