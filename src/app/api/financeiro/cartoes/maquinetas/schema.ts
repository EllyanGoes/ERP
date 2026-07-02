import { z } from "zod";

// Schema compartilhado entre POST (criação) e PATCH (edição parcial) de maquineta.
// Taxa e prazo por tipo de cartão: 0–100% e dias ≥ 0; no máximo uma por tipo.

export const taxaMaquinetaSchema = z.object({
  tipoForma: z.enum(["CARTAO_CREDITO", "CARTAO_DEBITO"]),
  taxaPct: z.coerce.number().min(0, "Taxa mínima 0%").max(100, "Taxa máxima 100%"),
  diasCompensacao: z.coerce.number().int().min(0, "Dias não pode ser negativo"),
});

export const maquinetaSchema = z.object({
  administradoraId: z.string().min(1, "Administradora é obrigatória"),
  nome: z.string().trim().min(1, "Nome é obrigatório"),
  ativo: z.boolean().optional(),
  taxas: z.array(taxaMaquinetaSchema).max(2).optional().default([]),
}).refine((d) => new Set(d.taxas.map((t) => t.tipoForma)).size === d.taxas.length, {
  message: "Só uma taxa por tipo de cartão", path: ["taxas"],
});

export const maquinetaPatchSchema = z.object({
  administradoraId: z.string().min(1).optional(),
  nome: z.string().trim().min(1, "Nome é obrigatório").optional(),
  ativo: z.boolean().optional(),
  // Quando informado, substitui o conjunto de taxas (upsert por tipo + remove os ausentes).
  taxas: z.array(taxaMaquinetaSchema).max(2).optional(),
}).refine((d) => !d.taxas || new Set(d.taxas.map((t) => t.tipoForma)).size === d.taxas.length, {
  message: "Só uma taxa por tipo de cartão", path: ["taxas"],
});
