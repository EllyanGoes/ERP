export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prismaSemEscopo } from "@/lib/prisma";

// Tipos que NÃO entram no sino: prazos de tarefa vivem na caixinha "Minhas
// Tarefas" (lista dinâmica — tarefa concluída some sozinha). Decisão 19/08:
// tarefa num ícone, o resto no sino; unificação fica para o futuro.
//
// Pedidos de aprovação também ficam fora (26/11): já aparecem no 👍 do topo
// (Minhas Aprovações), com contador próprio — no sino era duplicado. O
// resultado (aprovada/reprovada) para quem pediu continua no sino.
const TIPOS_FORA_DO_SINO = ["PROJETO_PRAZO", "COTACAO_APROVACAO_SOLICITADA", "PEDIDO_APROVACAO_SOLICITADA"];

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
