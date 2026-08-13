// Cliente mínimo da API do Google Drive v3 com Service Account — sem SDK
// (googleapis pesa ~10MB; aqui são 3 endpoints com fetch + JWT RS256 do crypto
// nativo). Usado pelo módulo de Documentos (docs/documentos-prd.md).
//
// Envs:
//   GOOGLE_SA_KEY        JSON da service account ({client_email, private_key, ...})
//   DRIVE_ROOT_FOLDER_ID id da pasta raiz ("ERP — Documentos") num Drive
//                        Compartilhado a que a SA tem acesso de Gerenciador de conteúdo
// Sem as duas envs, driveAtivo() = false e o módulo cai no fallback Vercel Blob.
import { createSign } from "crypto";
import { prismaSemEscopo } from "@/lib/prisma";

const SCOPE = "https://www.googleapis.com/auth/drive";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

type SaKey = { client_email: string; private_key: string };

function saKey(): SaKey | null {
  const raw = process.env.GOOGLE_SA_KEY;
  if (!raw) return null;
  try { return JSON.parse(raw) as SaKey; } catch { return null; }
}

export function driveAtivo(): boolean {
  return !!saKey() && !!process.env.DRIVE_ROOT_FOLDER_ID;
}

// ── Token (cache em módulo; expira em 1h, renova aos 55min) ──────────────────
let tokenCache: { token: string; expira: number } | null = null;

async function accessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expira) return tokenCache.token;
  const key = saKey();
  if (!key) throw new Error("GOOGLE_SA_KEY ausente");

  const agora = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "RS256", typ: "JWT" });
  const claims = b64({
    iss: key.client_email,
    scope: SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: agora,
    exp: agora + 3600,
  });
  const assinatura = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key.private_key, "base64url");
  const jwt = `${header}.${claims}.${assinatura}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Drive auth falhou: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: json.access_token, expira: Date.now() + (json.expires_in - 300) * 1000 };
  return json.access_token;
}

async function driveFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await accessToken();
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    tokenCache = null; // token revogado — tenta uma vez com token novo
    const novo = await accessToken();
    return fetch(url, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${novo}` } });
  }
  return res;
}

const COMUM = "supportsAllDrives=true";

// ── Pastas ───────────────────────────────────────────────────────────────────
async function acharOuCriarPasta(nome: string, paiId: string): Promise<string> {
  const q = encodeURIComponent(
    `name = '${nome.replace(/'/g, "\\'")}' and '${paiId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const busca = await driveFetch(`${API}/files?q=${q}&fields=files(id)&${COMUM}&includeItemsFromAllDrives=true`);
  if (busca.ok) {
    const json = (await busca.json()) as { files: { id: string }[] };
    if (json.files[0]) return json.files[0].id;
  }
  const cria = await driveFetch(`${API}/files?${COMUM}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nome, mimeType: "application/vnd.google-apps.folder", parents: [paiId] }),
  });
  if (!cria.ok) throw new Error(`Drive: criar pasta "${nome}" falhou: ${cria.status} ${await cria.text()}`);
  return ((await cria.json()) as { id: string }).id;
}

/** Pasta da categoria dentro da pasta da empresa (IDs cacheados em EmpresaDrive). */
export async function garantirPasta(empresaId: string, empresaNome: string, categoriaSlug: string, categoriaNome: string): Promise<string> {
  const raiz = process.env.DRIVE_ROOT_FOLDER_ID!;
  let cfg = await prismaSemEscopo.empresaDrive.findUnique({ where: { empresaId } });
  if (!cfg) {
    const pastaEmpresa = await acharOuCriarPasta(empresaNome, raiz);
    cfg = await prismaSemEscopo.empresaDrive.create({
      data: { empresaId, drivePastaId: pastaEmpresa, pastasCategoria: {} },
    });
  }
  const cache = (cfg.pastasCategoria as Record<string, string>) ?? {};
  if (cache[categoriaSlug]) return cache[categoriaSlug];
  const pastaCat = await acharOuCriarPasta(categoriaNome, cfg.drivePastaId);
  await prismaSemEscopo.empresaDrive.update({
    where: { empresaId },
    data: { pastasCategoria: { ...cache, [categoriaSlug]: pastaCat } },
  });
  return pastaCat;
}

// ── Arquivos ─────────────────────────────────────────────────────────────────
/** Upload multipart (até ~20MB — mesmo teto dos anexos). Retorna o fileId. */
export async function uploadArquivo(pastaId: string, nome: string, mime: string, conteudo: Buffer): Promise<string> {
  const boundary = `erp${Date.now().toString(36)}`;
  const meta = JSON.stringify({ name: nome, parents: [pastaId] });
  const corpo = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mime || "application/octet-stream"}\r\n\r\n`),
    conteudo,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await driveFetch(`${UPLOAD}/files?uploadType=multipart&${COMUM}&fields=id`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: new Uint8Array(corpo),
  });
  if (!res.ok) throw new Error(`Drive: upload falhou: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

/** Stream do conteúdo (proxy de download/preview pelo backend). */
export async function baixarArquivo(fileId: string): Promise<Response> {
  const res = await driveFetch(`${API}/files/${fileId}?alt=media&${COMUM}`);
  if (!res.ok) throw new Error(`Drive: download falhou: ${res.status}`);
  return res;
}

/** Move o arquivo para a pasta _lixeira/ da raiz (nunca apaga de verdade). */
export async function moverParaLixeira(fileId: string): Promise<void> {
  const raiz = process.env.DRIVE_ROOT_FOLDER_ID!;
  const lixeiraId = await acharOuCriarPasta("_lixeira", raiz);
  const info = await driveFetch(`${API}/files/${fileId}?fields=parents&${COMUM}`);
  const pais = info.ok ? (((await info.json()) as { parents?: string[] }).parents ?? []) : [];
  const res = await driveFetch(
    `${API}/files/${fileId}?addParents=${lixeiraId}&removeParents=${pais.join(",")}&${COMUM}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
  if (!res.ok) console.warn(`[drive] mover p/ lixeira falhou (${res.status}) — segue`);
}

/** Reconciliação: o arquivo ainda existe (e fora do lixo do Drive)? */
export async function arquivoExiste(fileId: string): Promise<boolean> {
  const res = await driveFetch(`${API}/files/${fileId}?fields=id,trashed&${COMUM}`);
  if (res.status === 404) return false;
  if (!res.ok) return true; // erro transitório: não marcar como sumido
  return !((await res.json()) as { trashed?: boolean }).trashed;
}
