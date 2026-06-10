export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, COOKIE_NAME, SessionPayload } from "@/lib/auth";
import { empresasParaSessao } from "@/lib/empresa";

// ── Rate limit de tentativas falhas (por instância serverless) ───────────────
// Em memória: cada instância conta sozinha, então o teto efetivo é maior que o
// LIMITE — ainda assim encarece brute force/credential stuffing sem infra nova.
// Para um limite global, trocar por tabela no Postgres ou Upstash Ratelimit.
const LIMITE_FALHAS = 10;
const JANELA_MS = 15 * 60_000;
const falhas = new Map<string, { count: number; resetAt: number }>();

function bloqueado(chave: string): boolean {
  const f = falhas.get(chave);
  return !!f && f.resetAt > Date.now() && f.count >= LIMITE_FALHAS;
}

function registraFalha(chave: string): void {
  const now = Date.now();
  if (falhas.size > 1000) {
    for (const [k, v] of Array.from(falhas)) if (v.resetAt < now) falhas.delete(k);
  }
  const f = falhas.get(chave);
  if (!f || f.resetAt < now) falhas.set(chave, { count: 1, resetAt: now + JANELA_MS });
  else f.count++;
}

export async function POST(req: NextRequest) {
  const { email, senha } = await req.json();
  if (!email || !senha) {
    return NextResponse.json({ error: "E-mail e senha são obrigatórios" }, { status: 400 });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "ip-desconhecido";
  const chave = `${ip}|${String(email).toLowerCase().trim()}`;
  if (bloqueado(chave)) {
    return NextResponse.json(
      { error: "Muitas tentativas de login. Aguarde alguns minutos e tente novamente." },
      { status: 429 },
    );
  }

  const user = await prisma.usuario.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { permissoes: true },
  });

  if (!user || !user.ativo) {
    registraFalha(chave);
    return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  const valid = await verifyPassword(senha, user.senha);
  if (!valid) {
    registraFalha(chave);
    return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  falhas.delete(chave); // login ok zera o contador desta chave

  const modulos = user.perfil === "ADMIN"
    ? ["*"]
    : user.permissoes.map((p) => p.modulo);

  // O token carrega só identidade — módulos vêm do banco (evita cookie > 4KB).
  const { activeEmpresaId, empresaIds, empresas } = await empresasParaSessao(user.id, user.perfil);
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    nome: user.nome,
    perfil: user.perfil,
    activeEmpresaId,
    empresaIds,
  };

  const token = signToken(payload);

  const res = NextResponse.json({
    user: { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil, modulos, empresas, activeEmpresaId },
  });

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8 hours
    path: "/",
  });

  return res;
}
