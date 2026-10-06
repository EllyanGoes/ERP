export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto, podeEditarTarefas, ORDEM_GAP } from "@/lib/projetos";

// POST /api/projetos/[id]/tarefas/ordem-cronograma { ordem: [tarefaId, ...] }
// Grava a ordem manual das linhas do cronograma (arrastar e soltar).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const acesso = await nivelNoProjeto(auth.session, params.id);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  if (!podeEditarTarefas(acesso.nivel)) return NextResponse.json({ error: "Sem permissão neste projeto." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ordem) ? body.ordem.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "Ordem vazia." }, { status: 400 });

  await prismaSemEscopo.$transaction(
    ids.map((id, i) => prismaSemEscopo.tarefa.updateMany({ where: { id, projetoId: params.id }, data: { ordemCronograma: (i + 1) * ORDEM_GAP } })),
  );
  return NextResponse.json({ ok: true });
}
