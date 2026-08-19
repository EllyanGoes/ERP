export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { notificarUsuario, marcarNotificacoesLidasPorLink } from "@/lib/notificacoes";

/**
 * Cron diário (07h BRT): notifica cada responsável sobre tarefas de projeto
 * vencendo hoje ou atrasadas, agrupadas por projeto. Protegido por CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // "Hoje" no fuso de SP: limite = fim do dia local.
  const agora = new Date();
  const fimDeHoje = new Date(agora);
  fimDeHoje.setHours(23, 59, 59, 999);

  const tarefas = await prismaSemEscopo.tarefa.findMany({
    where: {
      arquivada: false,
      concluidaEm: null,
      membros: { some: {} },
      prazo: { lte: fimDeHoje },
      projeto: { status: "ATIVO" },
    },
    select: {
      id: true, titulo: true, prazo: true,
      membros: { select: { usuarioId: true } },
      projeto: { select: { id: true, nome: true } },
    },
  });

  // Agrupa por responsável → projeto
  const porUsuario = new Map<string, Map<string, { nome: string; qtd: number }>>();
  for (const t of tarefas) {
    for (const { usuarioId } of t.membros) {
      const projetos = porUsuario.get(usuarioId) ?? new Map();
      const p = projetos.get(t.projeto.id) ?? { nome: t.projeto.nome, qtd: 0 };
      p.qtd += 1;
      projetos.set(t.projeto.id, p);
      porUsuario.set(usuarioId, projetos);
    }
  }

  let notificacoes = 0;
  for (const [usuarioId, projetos] of Array.from(porUsuario.entries())) {
    for (const [projetoId, info] of Array.from(projetos.entries())) {
      // Não empilha: a notificação de ontem do mesmo projeto vira lida antes
      // de criar a de hoje (o sino chegou a acumular 3 "Prazos em X").
      await marcarNotificacoesLidasPorLink(usuarioId, `/projetos/${projetoId}`, "PROJETO_PRAZO");
      await notificarUsuario({
        usuarioId,
        tipo: "PROJETO_PRAZO",
        titulo: `Prazos em ${info.nome}`,
        mensagem: `${info.qtd} tarefa${info.qtd > 1 ? "s" : ""} vencendo hoje ou atrasada${info.qtd > 1 ? "s" : ""}.`,
        link: `/projetos/${projetoId}`,
      });
      notificacoes++;
    }
  }

  return NextResponse.json({ ok: true, tarefas: tarefas.length, notificacoes });
}
