export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto, podeEditarTarefas, registrarAtividade, ORDEM_GAP } from "@/lib/projetos";

// POST /api/projetos/tarefas/[tarefaId]/copiar — duplica o cartão (título,
// descrição, campos, etiquetas e checklist desmarcado) logo abaixo do original.
// Comentários/anexos/atividade NÃO são copiados.
export async function POST(_: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;

  const original = await prismaSemEscopo.tarefa.findUnique({
    where: { id: params.tarefaId },
    include: { etiquetas: true, membros: true, checklist: { orderBy: { ordem: "asc" } } },
  });
  if (!original) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  const acesso = await nivelNoProjeto(auth.session, original.projetoId);
  if (!acesso || !podeEditarTarefas(acesso.nivel)) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });

  const ultima = await prismaSemEscopo.tarefa.findFirst({
    where: { colunaId: original.colunaId, arquivada: false },
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });

  const copia = await prisma.tarefa.create({
    data: {
      projetoId: original.projetoId,
      colunaId: original.colunaId,
      titulo: `${original.titulo} (cópia)`,
      descricao: original.descricao,
      ordem: (ultima?.ordem ?? original.ordem) + ORDEM_GAP,
      prioridade: original.prioridade,
      membros: { create: original.membros.map((m) => ({ usuarioId: m.usuarioId })) },
      dataInicio: original.dataInicio,
      prazo: original.prazo,
      etiquetas: { create: original.etiquetas.map((e) => ({ etiquetaId: e.etiquetaId })) },
      checklist: { create: original.checklist.map((c, i) => ({ texto: c.texto, ordem: i + 1, feito: false })) },
    },
    select: { id: true, titulo: true },
  });

  await registrarAtividade({
    projetoId: original.projetoId, tarefaId: copia.id, autorId: auth.session.sub,
    tipo: "CRIOU", detalhe: { copiaDe: original.titulo },
  });
  return NextResponse.json({ data: copia }, { status: 201 });
}
