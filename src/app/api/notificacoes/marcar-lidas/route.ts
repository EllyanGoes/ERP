export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prismaSemEscopo } from "@/lib/prisma";

// POST /api/notificacoes/marcar-lidas — marca como lidas. Corpo opcional { ids:[] };
// sem ids, marca todas as não lidas do usuário.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] | undefined = Array.isArray(body?.ids) ? body.ids : undefined;

  await prismaSemEscopo.notificacao.updateMany({
    where: {
      usuarioId: session.sub,
      lida: false,
      ...(ids && ids.length ? { id: { in: ids } } : {}),
    },
    data: { lida: true },
  });

  return NextResponse.json({ ok: true });
}
