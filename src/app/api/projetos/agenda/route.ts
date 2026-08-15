export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { tokenFeedAgenda } from "@/lib/projetos";

// GET /api/projetos/agenda — datas finais (prazos) das tarefas abertas de
// todos os projetos ativos que o usuário vê (dono ou membro), + a URL do
// feed ICS para assinar no Calendário do Mac / Google Agenda.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;

  const tarefas = await prismaSemEscopo.tarefa.findMany({
    where: {
      arquivada: false,
      concluidaEm: null,
      prazo: { not: null },
      projeto: {
        status: "ATIVO",
        OR: [{ donoId: auth.session.sub }, { membros: { some: { usuarioId: auth.session.sub } } }],
      },
    },
    select: {
      id: true, titulo: true, prazo: true, prioridade: true,
      projeto: { select: { id: true, nome: true, cor: true } },
      coluna: { select: { nome: true } },
      membros: { select: { usuario: { select: { id: true, nome: true } } } },
    },
    orderBy: { prazo: "asc" },
  });

  const icsUrl = `${req.nextUrl.origin}/api/projetos/agenda/ics?u=${auth.session.sub}&t=${tokenFeedAgenda(auth.session.sub)}`;
  return NextResponse.json({
    data: tarefas.map((t) => ({ ...t, membros: t.membros.map((m) => m.usuario) })),
    icsUrl,
  });
}
