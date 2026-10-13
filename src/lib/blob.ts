// Vercel Blob — o store de produção é PRIVADO (put com access "public" falha
// com "Cannot use public access on a private store"). Todo upload entra como
// privado e é servido pelo proxy autenticado /api/arquivos/<pathname>, que é a
// URL gravada no banco. Módulos com regra própria de acesso (GED, RH) não
// passam pelo proxy genérico: fazem o stream na rota deles com streamBlob().
import { put, get, del } from "@vercel/blob";

export const PROXY_PREFIX = "/api/arquivos/";

export type BlobSalvo = { url: string; pathname: string };

/** Sobe o arquivo privado e devolve a URL do proxy (relativa, mesma origem). */
export async function uploadBlob(pathname: string, body: Parameters<typeof put>[1], contentType?: string): Promise<BlobSalvo> {
  const blob = await put(pathname, body, {
    access: "private",
    addRandomSuffix: true,
    ...(contentType ? { contentType } : {}),
  });
  return { url: PROXY_PREFIX + blob.pathname, pathname: blob.pathname };
}

/** pathname do blob a partir da URL do proxy ou de uma URL absoluta do Blob (legado). */
export function blobPathname(url: string): string {
  if (url.startsWith(PROXY_PREFIX)) return decodeURIComponent(url.slice(PROXY_PREFIX.length));
  try { return decodeURIComponent(new URL(url).pathname.replace(/^\//, "")); } catch { return url.replace(/^\//, ""); }
}

/** Stream do blob privado (null se não existir). */
export async function streamBlob(url: string) {
  const res = await get(blobPathname(url), { access: "private" });
  if (!res) return null;
  return { stream: res.stream, contentType: res.blob.contentType || "application/octet-stream", size: res.blob.size };
}

/** Apaga pelo pathname/URL; arquivo já ausente não trava. */
export async function deleteBlob(url: string | null | undefined) {
  if (!url) return;
  await del(blobPathname(url)).catch(() => {});
}
