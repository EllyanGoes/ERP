// NOTE: uses jsonwebtoken (CommonJS) — NOT jose — to avoid ESM bundling issues
// in Next.js Node.js runtime. The middleware uses jose directly (Edge-compatible).
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const COOKIE_NAME = "erp_session";
const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  // Fail-closed: sem segredo, é melhor derrubar a autenticação do que aceitar
  // tokens assinados com um valor conhecido publicamente no repositório.
  if (!secret) throw new Error("JWT_SECRET não configurado — defina a variável de ambiente.");
  return secret;
};

export type SessionPayload = {
  sub: string;       // user id
  email: string;
  nome: string;
  perfil: "ADMIN" | "USUARIO";
  // Multiempresa (Fase 2). Opcionais porque tokens antigos (sem os campos)
  // continuam válidos por até 8h — nesse caso o escopo cai na Tramontin
  // (EMPRESA_PADRAO_ID em @/lib/prisma).
  activeEmpresaId?: string;   // empresa ativa no seletor
  empresaIds?: string[];      // empresas que o usuário pode ativar
  // Sessão/dispositivo (gestão de dispositivos). id da UsuarioSessao. Opcional —
  // tokens legados sem jti continuam válidos até expirar.
  jti?: string;
  // NOTE: os módulos NÃO entram aqui de propósito — embutir a lista de permissões
  // estourava o limite de ~4KB do cookie. Use getUserModulos()/hasModulo() de
  // "@/lib/permissions" para carregar e checar acesso a partir do banco.
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// Validade da sessão: 24h (decisão do usuário). O app reemite o token
// periodicamente (mount/foco/intervalo), então a revogação não espera as 24h.
export const SESSAO_MAX_AGE_S = 60 * 60 * 24;

export function signToken(payload: SessionPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "24h" });
}

export function verifyToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getSecret()) as SessionPayload;
  } catch {
    return null;
  }
}

// ── Revogação de sessão (gestão de dispositivos) ────────────────────────────
// Cache em memória (por instância) p/ não consultar o banco a cada request.
// TTL curto: a revogação de um dispositivo vale em ≤60s mesmo com aba aberta.
const SESSAO_TTL_MS = 60_000;
const cacheSessao = new Map<string, { ativa: boolean; ate: number }>();

export async function sessaoAtiva(jti: string): Promise<boolean> {
  const now = Date.now();
  const c = cacheSessao.get(jti);
  if (c && c.ate > now) return c.ativa;
  let ativa = true;
  try {
    const s = await prisma.usuarioSessao.findUnique({
      where: { id: jti },
      select: { revogadoEm: true, expiraEm: true },
    });
    ativa = !!s && s.revogadoEm == null && s.expiraEm.getTime() > now;
  } catch {
    // Falha de DB: fail-open (não derruba todo mundo por um soluço de infra).
    ativa = true;
  }
  cacheSessao.set(jti, { ativa, ate: now + SESSAO_TTL_MS });
  return ativa;
}

export function invalidarCacheSessao(jti: string): void {
  cacheSessao.delete(jti);
}

// Heurística leve de user-agent (sem dependência).
export function parseUserAgent(ua: string | null | undefined): { dispositivo: string; navegador: string; so: string } {
  const s = ua ?? "";
  const so =
    /Windows/i.test(s) ? "Windows" :
    /Android/i.test(s) ? "Android" :
    /(iPhone|iPad|iPod)/i.test(s) ? "iOS" :
    /Mac OS X|Macintosh/i.test(s) ? "macOS" :
    /Linux/i.test(s) ? "Linux" : "Desconhecido";
  const navegador =
    /Edg\//i.test(s) ? "Edge" :
    /OPR\/|Opera/i.test(s) ? "Opera" :
    /Firefox\//i.test(s) ? "Firefox" :
    /Chrome\//i.test(s) ? "Chrome" :
    /Safari\//i.test(s) ? "Safari" : "Desconhecido";
  const dispositivo = /Mobile|Android|iPhone|iPad|iPod/i.test(s) ? "Celular/Tablet" : "Computador";
  return { dispositivo, navegador, so };
}

// Server-side: read session from cookies (for Server Components and Route Handlers)
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  // Sessão revogada (deslogado de outro dispositivo) → trata como não logado.
  if (payload.jti && !(await sessaoAtiva(payload.jti))) return null;
  return payload;
}

export type RequireSessionResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; response: NextResponse };

/**
 * Defesa em profundidade para Route Handlers de API.
 *
 * O middleware já bloqueia /api/* sem sessão válida, mas chamar requireSession()
 * no início de uma rota deixa a proteção explícita e dá acesso ao usuário logado
 * (ex.: usar session.sub em campos de auditoria em vez de confiar no corpo da req).
 *
 * Uso:
 *   const auth = await requireSession();
 *   if (!auth.ok) return auth.response;   // 401 padronizado
 *   const userId = auth.session.sub;
 */
export async function requireSession(): Promise<RequireSessionResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }
  return { ok: true, session };
}

/**
 * Como requireSession(), mas exige perfil ADMIN.
 *
 * Uso:
 *   const auth = await requireAdmin();
 *   if (!auth.ok) return auth.response;   // 401 ou 403 padronizado
 */
export async function requireAdmin(): Promise<RequireSessionResult> {
  const auth = await requireSession();
  if (!auth.ok) return auth;
  if (auth.session.perfil !== "ADMIN") {
    return { ok: false, response: NextResponse.json({ error: "Apenas administradores" }, { status: 403 }) };
  }
  return auth;
}
