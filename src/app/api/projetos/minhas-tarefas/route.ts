export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";

// GET /api/projetos/minhas-tarefas — tarefas abertas do usuário em projetos ativos.
export async function GET() {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;

  const tarefas = await prismaSemEscopo.tarefa.findMany({
    where: {
      responsavelId: auth.session.sub,
      arquivada: false,
      concluidaEm: null,
      projeto: { status: "ATIVO" },
    },
    select: {
      id: true, titulo: true, prioridade: true, prazo: true, dataInicio: true,
      projeto: { select: { id: true, nome: true, cor: true } },
      coluna: { select: { nome: true } },
      etiquetas: { select: { etiqueta: { select: { id: true, nome: true, cor: true } } } },
    },
    orderBy: [{ prazo: { sort: "asc", nulls: "last" } }, { prioridade: "desc" }],
  });

  return NextResponse.json({
    data: tarefas.map((t) => ({ ...t, etiquetas: t.etiquetas.map((e) => e.etiqueta) })),
  });
}
