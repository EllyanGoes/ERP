export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { COOKIE_NAME, getSession, invalidarCacheSessao } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  // Revoga a sessão/dispositivo atual antes de limpar o cookie.
  const session = await getSession();
  if (session?.jti) {
    await prisma.usuarioSessao.update({
      where: { id: session.jti },
      data: { revogadoEm: new Date() },
    }).catch(() => { /* sessão já revogada/inexistente — segue */ });
    invalidarCacheSessao(session.jti);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return res;
}
