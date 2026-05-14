// NOTE: uses jsonwebtoken (CommonJS) — NOT jose — to avoid ESM bundling issues
// in Next.js Node.js runtime. The middleware uses jose directly (Edge-compatible).
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

export const COOKIE_NAME = "erp_session";
const getSecret = () => process.env.JWT_SECRET ?? "erp-super-secret-change-in-prod-2024";

export type SessionPayload = {
  sub: string;       // user id
  email: string;
  nome: string;
  perfil: "ADMIN" | "USUARIO";
  modulos: string[]; // permitted module keys (ADMIN = ["*"])
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

export function canAccess(session: SessionPayload, modulo: string): boolean {
  if (session.perfil === "ADMIN") return true;
  return session.modulos.includes(modulo) || session.modulos.includes("*");
}
