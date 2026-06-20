export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, invalidarCacheSessao, COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/auth/sessions/[id] — revoga (desloga) uma sessão DO PRÓPRIO usuário.
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  // Só pode revogar sessões da própria conta.
  const sessao = await prisma.usuarioSessao.findUnique({ where: { id: params.id }, select: { usuarioId: true } });
  if (!sessao || sessao.usuarioId !== auth.session.sub) {
    return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
  }

  await prisma.usuarioSessao.update({ where: { id: params.id }, data: { revogadoEm: new Date() } });
  invalidarCacheSessao(params.id);

  // Revogar a própria sessão atual = logout deste dispositivo.
  const atual = params.id === auth.session.jti;
  const res = NextResponse.json({ data: { ok: true, atual } });
  if (atual) res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return res;
}
