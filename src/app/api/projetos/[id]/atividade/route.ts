export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto } from "@/lib/projetos";

// GET /api/projetos/[id]/atividade?cursor=<id> — feed paginado (50 por página).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const acesso = await nivelNoProjeto(auth.session, params.id);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

  const cursor = new URL(req.url).searchParams.get("cursor");
  const atividades = await prismaSemEscopo.tarefaAtividade.findMany({
    where: { projetoId: params.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true, tipo: true, detalhe: true, createdAt: true,
      autor: { select: { id: true, nome: true } },
      tarefa: { select: { id: true, titulo: true } },
    },
  });

  return NextResponse.json({
    data: atividades,
    nextCursor: atividades.length === 50 ? atividades[atividades.length - 1].id : null,
  });
}
