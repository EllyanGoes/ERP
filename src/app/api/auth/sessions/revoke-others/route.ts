export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireSession, invalidarCacheSessao } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/auth/sessions/revoke-others — desloga todos os outros dispositivos.
export async function POST() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { sub, jti } = auth.session;

  const outras = await prisma.usuarioSessao.findMany({
    where: { usuarioId: sub, revogadoEm: null, ...(jti ? { id: { not: jti } } : {}) },
    select: { id: true },
  });

  await prisma.usuarioSessao.updateMany({
    where: { usuarioId: sub, revogadoEm: null, ...(jti ? { id: { not: jti } } : {}) },
    data: { revogadoEm: new Date() },
  });
  for (const o of outras) invalidarCacheSessao(o.id);

  return NextResponse.json({ data: { revogadas: outras.length } });
}
