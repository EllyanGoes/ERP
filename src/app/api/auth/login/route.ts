export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, COOKIE_NAME, SessionPayload, SESSAO_MAX_AGE_S, parseUserAgent } from "@/lib/auth";
import { empresasParaSessao } from "@/lib/empresa";
import { randomUUID } from "crypto";

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

  // Registra a sessão/dispositivo (gestão de dispositivos). id = jti do token.
  const jti = randomUUID();
  const ua = req.headers.get("user-agent");
  const { dispositivo, navegador, so } = parseUserAgent(ua);
  await prisma.usuarioSessao.create({
    data: {
      id: jti,
      usuarioId: user.id,
      userAgent: ua ?? null,
      dispositivo, navegador, so,
      ip,
      expiraEm: new Date(Date.now() + SESSAO_MAX_AGE_S * 1000),
    },
  }).catch(() => { /* não bloqueia o login se o registro falhar */ });

  // O token carrega só identidade — módulos vêm do banco (evita cookie > 4KB).
  const { activeEmpresaId, empresaIds, empresas } = await empresasParaSessao(user.id, user.perfil);
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    nome: user.nome,
    perfil: user.perfil,
    activeEmpresaId,
    empresaIds,
    jti,
  };

  const token = signToken(payload);

  const res = NextResponse.json({
    user: { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil, modulos, empresas, activeEmpresaId },
  });

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSAO_MAX_AGE_S, // 24h
    path: "/",
  });

  return res;
}
