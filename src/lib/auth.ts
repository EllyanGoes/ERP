// NOTE: uses jsonwebtoken (CommonJS) — NOT jose — to avoid ESM bundling issues
// in Next.js Node.js runtime. The middleware uses jose directly (Edge-compatible).
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

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

export function signToken(payload: SessionPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "8h" });
}

export function verifyToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getSecret()) as SessionPayload;
  } catch {
    return null;
  }
}

// Server-side: read session from cookies (for Server Components and Route Handlers)
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
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
