import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Validação e helpers da ingestão de tracking (POST /api/t/e).
// ─────────────────────────────────────────────────────────────────────────────

/** Limites de segurança da ingestão (cap de payload e de batch). */
export const MAX_BODY_BYTES = 10 * 1024; // 10KB
export const MAX_EVENTOS = 20;

const eventoSchema = z.object({
  tipo: z.enum(["pageview", "evento"]),
  nome: z.string().max(200).optional().nullable(),
  path: z.string().max(2000),
});

const utmSchema = z.object({
  source: z.string().max(200).optional().nullable(),
  medium: z.string().max(200).optional().nullable(),
  campaign: z.string().max(200).optional().nullable(),
  term: z.string().max(200).optional().nullable(),
  content: z.string().max(200).optional().nullable(),
});

export const ingestSchema = z.object({
  site: z.string().min(1).max(64),
  vid: z.string().min(3).max(64),
  sid: z.string().min(3).max(64),
  eventos: z.array(eventoSchema).max(MAX_EVENTOS),
  // Presente só no primeiro payload de uma sessão nova.
  novaSessao: z
    .object({
      ref: z.string().max(1000).optional().nullable(),
      utm: utmSchema.optional().nullable(),
      cid: z.string().max(64).optional().nullable(),
    })
    .optional()
    .nullable(),
  identify: z.object({ email: z.string().min(3).max(320) }).optional().nullable(),
});

export type IngestPayload = z.infer<typeof ingestSchema>;

/**
 * Casa o hostname do Origin contra a allowlist de domínios do site, por sufixo
 * de domínio: "exemplo.com" casa "exemplo.com" e "www.exemplo.com", mas não
 * "outroexemplo.com" (o sufixo exige o "." separador).
 */
export function hostnamePermitido(hostname: string, dominios: string[]): boolean {
  const h = hostname.toLowerCase();
  return dominios.some((d) => {
    const dom = d.toLowerCase();
    return h === dom || h.endsWith(`.${dom}`);
  });
}

/** Extrai o hostname de um header Origin; null se ausente/inválido. */
export function hostnameDoOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

/** Normaliza o path do evento: só o pathname (sem querystring/hash), truncado. */
export function normalizarPath(path: string): string {
  let p = path;
  // Aceita URL completa por robustez (o snippet manda só o pathname).
  if (p.includes("://")) {
    try {
      p = new URL(p).pathname;
    } catch {
      /* segue com a string crua */
    }
  }
  p = p.split("?")[0].split("#")[0];
  if (!p.startsWith("/")) p = `/${p}`;
  return p.slice(0, 500);
}

// ── Rate limit em memória por instância (serverless: cada instância tem o seu
// Map — suficiente como freio de abuso, não é quota exata) ──
const JANELA_MS = 60_000;
const MAX_REQ_POR_JANELA = 120;
const janelas = new Map<string, { inicio: number; count: number }>();

/** true = dentro do limite; false = excedeu (responder 429). */
export function dentroDoRateLimit(chave: string): boolean {
  const agora = Date.now();
  const atual = janelas.get(chave);
  if (!atual || agora - atual.inicio >= JANELA_MS) {
    // Poda oportunista para o Map não crescer sem limite entre janelas.
    if (janelas.size > 10_000) {
      janelas.forEach((v, k) => {
        if (agora - v.inicio >= JANELA_MS) janelas.delete(k);
      });
    }
    janelas.set(chave, { inicio: agora, count: 1 });
    return true;
  }
  atual.count += 1;
  return atual.count <= MAX_REQ_POR_JANELA;
}
