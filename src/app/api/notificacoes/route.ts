export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prismaSemEscopo } from "@/lib/prisma";

// GET /api/notificacoes — últimas notificações do usuário logado + nº não lidas.
// Usado pelo sino (lista) e pelo poller de toast (mostra as novas).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [data, naoLidas] = await Promise.all([
    prismaSemEscopo.notificacao.findMany({
      where: { usuarioId: session.sub },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prismaSemEscopo.notificacao.count({ where: { usuarioId: session.sub, lida: false } }),
  ]);

  return NextResponse.json({ data, naoLidas });
}
