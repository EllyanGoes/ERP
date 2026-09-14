export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto, podeEditarTarefas, registrarAtividade, ORDEM_GAP } from "@/lib/projetos";

// POST /api/projetos/inbox/[id]/mover { projetoId, colunaId? } — o item da
// caixa de entrada vira Tarefa real no projeto (1ª coluna ativa, ou a
// informada), com o usuário como responsável, e sai da caixa.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const item = await prismaSemEscopo.tarefaInbox.findFirst({
    where: { id: params.id, usuarioId: auth.session.sub },
    select: { id: true, titulo: true, notas: true },
  });
  if (!item) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const projetoId = String(body.projetoId ?? "");
  const acesso = await nivelNoProjeto(auth.session, projetoId);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  if (!podeEditarTarefas(acesso.nivel)) return NextResponse.json({ error: "Sem permissão neste projeto." }, { status: 403 });
  if (acesso.projeto.status === "ARQUIVADO") return NextResponse.json({ error: "Projeto arquivado." }, { status: 400 });

  const coluna = await prismaSemEscopo.projetoColuna.findFirst({
    where: body.colunaId ? { id: String(body.colunaId), projetoId, arquivada: false } : { projetoId, arquivada: false, concluiTarefa: false },
    orderBy: { ordem: "asc" },
    select: { id: true },
  });
  if (!coluna) return NextResponse.json({ error: "O projeto não tem coluna disponível." }, { status: 400 });

  const ultima = await prismaSemEscopo.tarefa.findFirst({
    where: { colunaId: coluna.id, arquivada: false },
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });

  const tarefa = await prisma.tarefa.create({
    data: {
      projetoId,
      colunaId: coluna.id,
      titulo: item.titulo,
      descricao: item.notas,
      ordem: (ultima?.ordem ?? 0) + ORDEM_GAP,
      membros: { create: [{ usuarioId: auth.session.sub }] },
    },
    select: { id: true },
  });
  await registrarAtividade({ projetoId, tarefaId: tarefa.id, autorId: auth.session.sub, tipo: "CRIOU", detalhe: { origem: "caixa-de-entrada" } });
  await prismaSemEscopo.tarefaInbox.delete({ where: { id: item.id } });

  return NextResponse.json({ data: { tarefaId: tarefa.id, projetoId } });
}
