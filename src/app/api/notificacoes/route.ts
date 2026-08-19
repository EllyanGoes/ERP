export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prismaSemEscopo } from "@/lib/prisma";

// Tipos que NÃO entram no sino: prazos de tarefa vivem na caixinha "Minhas
// Tarefas" (lista dinâmica — tarefa concluída some sozinha). Decisão 19/08:
// tarefa num ícone, o resto no sino; unificação fica para o futuro.
const TIPOS_FORA_DO_SINO = ["PROJETO_PRAZO"];

// GET /api/notificacoes — últimas notificações do usuário logado + nº não lidas.
// Usado pelo sino (lista) e pelo poller de toast (mostra as novas).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const where = { usuarioId: session.sub, tipo: { notIn: TIPOS_FORA_DO_SINO } };
  const [data, naoLidas] = await Promise.all([
    prismaSemEscopo.notificacao.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prismaSemEscopo.notificacao.count({ where: { ...where, lida: false } }),
  ]);

  return NextResponse.json({ data, naoLidas });
}
