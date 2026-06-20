export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/auth/sessions — dispositivos/sessões ativas do usuário logado.
export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { sub, jti } = auth.session;

  const sessoes = await prisma.usuarioSessao.findMany({
    where: { usuarioId: sub, revogadoEm: null, expiraEm: { gt: new Date() } },
    orderBy: { ultimoAcessoEm: "desc" },
    select: {
      id: true, dispositivo: true, navegador: true, so: true, ip: true,
      criadoEm: true, ultimoAcessoEm: true,
    },
  });

  return NextResponse.json({
    data: sessoes.map((s) => ({ ...s, atual: s.id === jti })),
  });
}
