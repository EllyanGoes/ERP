// Cofre de credenciais dos processos externos (docs/processos-prd.md, fase 2).
// AES-256-GCM (node:crypto): IV aleatório de 12 bytes por valor cifrado, tag de 16 bytes.
// Formato gravado: "v1.<iv b64>.<tag b64>.<cifra b64>" — o "v1" permite trocar o esquema depois.
// Chave: PROCESSOS_CRED_KEY = 32 bytes em base64 (gerar com `openssl rand -base64 32`).
// Sem a chave o cofre fica "não configurado": nada é gravado nem lido (o resto do módulo segue).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSAO = "v1";

/** Chave do cofre (32 bytes) ou null se a env não estiver configurada/válida. */
export function chaveCofre(env: string | undefined = process.env.PROCESSOS_CRED_KEY): Buffer | null {
  if (!env) return null;
  try {
    const k = Buffer.from(env.trim(), "base64");
    return k.length === 32 ? k : null;
  } catch {
    return null;
  }
}

export const cofreConfigurado = () => chaveCofre() !== null;

export function cifrar(texto: string, chave: Buffer | null = chaveCofre()): string {
  if (!chave) throw new Error("Cofre não configurado (PROCESSOS_CRED_KEY).");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave, iv);
  const cifra = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return [VERSAO, iv.toString("base64"), tag.toString("base64"), cifra.toString("base64")].join(".");
}

/** Decifra; lança erro se a chave estiver errada ou o conteúdo/tag tiver sido adulterado. */
export function decifrar(gravado: string, chave: Buffer | null = chaveCofre()): string {
  if (!chave) throw new Error("Cofre não configurado (PROCESSOS_CRED_KEY).");
  const [v, ivB64, tagB64, cifraB64] = gravado.split(".");
  if (v !== VERSAO || !ivB64 || !tagB64 || cifraB64 == null) throw new Error("Formato de credencial inválido.");
  const d = createDecipheriv("aes-256-gcm", chave, Buffer.from(ivB64, "base64"));
  d.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([d.update(Buffer.from(cifraB64, "base64")), d.final()]).toString("utf8");
}

/** Login mascarado para a listagem: "123•••••89" (nunca o valor inteiro). */
export function mascarar(texto: string): string {
  const t = texto.trim();
  if (t.length <= 4) return "•".repeat(Math.max(4, t.length));
  const ini = t.slice(0, Math.min(3, Math.floor(t.length / 4)));
  const fim = t.slice(-2);
  return `${ini}${"•".repeat(5)}${fim}`;
}
