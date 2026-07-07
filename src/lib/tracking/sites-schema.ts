import { z } from "zod";

// Validação do CRUD de Sites Rastreados (/api/marketing/sites). Fica aqui (e
// não inline na rota) porque rotas do App Router só podem exportar handlers, e
// o schema é compartilhado entre a lista e o [id].

/** hostname válido: rótulos alfanuméricos + hífen, com pelo menos um ponto. */
const dominioRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Normaliza entrada do usuário: trim, lowercase, remove protocolo/porta/path. */
export function normalizarDominio(valor: string): string {
  let d = valor.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.split("/")[0].split(":")[0];
  return d;
}

export const siteRastreadoSchema = z.object({
  nome: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres"),
  dominios: z
    .array(z.string())
    .min(1, "Informe pelo menos um domínio")
    .transform((arr) => Array.from(new Set(arr.map(normalizarDominio).filter(Boolean))))
    .refine((arr) => arr.length > 0, "Informe pelo menos um domínio")
    .refine(
      (arr) => arr.every((d) => dominioRegex.test(d) && d.length <= 253),
      "Domínio inválido — use só o hostname (ex.: exemplo.com.br)",
    ),
  ativo: z.boolean().optional(),
});

export type SiteRastreadoFormData = z.input<typeof siteRastreadoSchema>;
