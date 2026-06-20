export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, signToken, COOKIE_NAME, SessionPayload, SESSAO_MAX_AGE_S, sessaoAtiva } from "@/lib/auth";
import { empresasParaSessao } from "@/lib/empresa";

// POST /api/auth/refresh
// Reads the current JWT, fetches fresh user + permissions from DB,
// and reissues the session cookie with an updated token.
// Called automatically on app mount so stale permission tokens are fixed
// without requiring a manual logout/login.
export async function POST() {
  // Ponto de verificação da revogação de dispositivo (modelo eventual): se a
  // sessão foi encerrada em outro dispositivo, limpa o cookie e força re-login.
  const session = await getSession();
  if (!session || (session.jti && !(await sessaoAtiva(session.jti)))) {
    const res = NextResponse.json({ error: "Sessão encerrada" }, { status: 401 });
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  // Fetch fresh data from DB
  const user = await prisma.usuario.findUnique({
    where: { id: session.sub },
    include: { permissoes: true },
  });

  if (!user || !user.ativo) {
    // User was deactivated — clear cookie and force re-login
    const res = NextResponse.json({ error: "Conta inativa ou não encontrada" }, { status: 401 });
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  const modulos = user.perfil === "ADMIN"
    ? ["*"]
    : user.permissoes.map((p) => p.modulo);

  // O token carrega só identidade — módulos vêm do banco (evita cookie > 4KB).
  // Preserva a empresa ativa do token atual, se ela continuar permitida.
  const { activeEmpresaId, empresaIds, empresas } = await empresasParaSessao(
    user.id,
    user.perfil as "ADMIN" | "USUARIO",
    session.activeEmpresaId
  );
  const payload: SessionPayload = {
    sub:    user.id,
    email:  user.email,
    nome:   user.nome,
    perfil: user.perfil as "ADMIN" | "USUARIO",
    activeEmpresaId,
    empresaIds,
    jti:    session.jti, // mantém a mesma sessão/dispositivo
  };

  // Mantém a sessão "viva": último acesso + estende a expiração para +24h.
  if (session.jti) {
    await prisma.usuarioSessao.update({
      where: { id: session.jti },
      data: { ultimoAcessoEm: new Date(), expiraEm: new Date(Date.now() + SESSAO_MAX_AGE_S * 1000) },
    }).catch(() => { /* sessão sumiu — o cookie reemitido segue válido até expirar */ });
  }

  const token = signToken(payload);

  const res = NextResponse.json({
    user: {
      id:      user.id,
      nome:    user.nome,
      email:   user.email,
      perfil:  user.perfil,
      modulos,
      empresas,
      activeEmpresaId,
    },
  });

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   SESSAO_MAX_AGE_S, // 24h
    path:     "/",
  });

  return res;
}
