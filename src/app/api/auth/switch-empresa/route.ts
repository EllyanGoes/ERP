export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, signToken, COOKIE_NAME, SessionPayload } from "@/lib/auth";
import { empresasParaSessao } from "@/lib/empresa";

// POST /api/auth/switch-empresa — troca a empresa ativa do seletor.
// Revalida no banco a lista de empresas permitidas (não confia na do token,
// que pode estar defasada) e reassina o cookie de sessão.
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const { empresaId } = await req.json().catch(() => ({}));
  if (!empresaId || typeof empresaId !== "string") {
    return NextResponse.json({ error: "empresaId é obrigatório" }, { status: 400 });
  }

  const { empresaIds, empresas } = await empresasParaSessao(session.sub, session.perfil);
  if (!empresaIds.includes(empresaId)) {
    return NextResponse.json({ error: "Empresa não permitida para este usuário" }, { status: 403 });
  }

  const payload: SessionPayload = {
    sub: session.sub,
    email: session.email,
    nome: session.nome,
    perfil: session.perfil,
    activeEmpresaId: empresaId,
    empresaIds,
  };

  const res = NextResponse.json({
    ok: true,
    activeEmpresaId: empresaId,
    empresa: empresas.find((e) => e.id === empresaId) ?? null,
  });

  res.cookies.set(COOKIE_NAME, signToken(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8 hours
    path: "/",
  });

  return res;
}
