export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, COOKIE_NAME, SessionPayload } from "@/lib/auth";
import { empresasParaSessao } from "@/lib/empresa";

export async function POST(req: NextRequest) {
  const { email, senha } = await req.json();
  if (!email || !senha) {
    return NextResponse.json({ error: "E-mail e senha são obrigatórios" }, { status: 400 });
  }

  const user = await prisma.usuario.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { permissoes: true },
  });

  if (!user || !user.ativo) {
    return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  const valid = await verifyPassword(senha, user.senha);
  if (!valid) {
    return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  const modulos = user.perfil === "ADMIN"
    ? ["*"]
    : user.permissoes.map((p) => p.modulo);

  // O token carrega só identidade — módulos vêm do banco (evita cookie > 4KB).
  const { activeEmpresaId, empresaIds } = await empresasParaSessao();
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
    user: { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil, modulos },
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
