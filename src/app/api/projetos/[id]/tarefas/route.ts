export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto, podeEditarTarefas, registrarAtividade, notificarAtribuicao, ORDEM_GAP } from "@/lib/projetos";

// GET /api/projetos/[id]/tarefas?arquivadas=1 — tarefas arquivadas do quadro
// (painel do ícone de arquivo: restaurar ou excluir de vez).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const acesso = await nivelNoProjeto(auth.session, params.id);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  if (req.nextUrl.searchParams.get("arquivadas") !== "1") {
    return NextResponse.json({ error: "Use ?arquivadas=1." }, { status: 400 });
  }
  const tarefas = await prismaSemEscopo.tarefa.findMany({
    where: { projetoId: params.id, arquivada: true },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, titulo: true, updatedAt: true, concluidaEm: true,
      coluna: { select: { nome: true } },
    },
  });
  return NextResponse.json({ data: tarefas });
}

// POST /api/projetos/[id]/tarefas — criação (inline do kanban ou completa).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const acesso = await nivelNoProjeto(auth.session, params.id);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  if (!podeEditarTarefas(acesso.nivel)) return NextResponse.json({ error: "Sem permissão neste projeto." }, { status: 403 });
  if (acesso.projeto.status === "ARQUIVADO") return NextResponse.json({ error: "Projeto arquivado." }, { status: 400 });

  const body = await req.json();
  const titulo = String(body.titulo ?? "").trim();
  const membroIds: string[] = Array.isArray(body.membroIds)
    ? body.membroIds.filter((m: unknown) => typeof m === "string")
    : body.responsavelId ? [body.responsavelId] : [];
  if (!titulo) return NextResponse.json({ error: "Informe o título da tarefa." }, { status: 400 });

  const coluna = await prismaSemEscopo.projetoColuna.findFirst({
    where: { id: String(body.colunaId ?? ""), projetoId: params.id, arquivada: false },
    select: { id: true, concluiTarefa: true },
  });
  if (!coluna) return NextResponse.json({ error: "Coluna inválida." }, { status: 400 });

  const ultima = await prismaSemEscopo.tarefa.findFirst({
    where: { colunaId: coluna.id, arquivada: false },
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });

  const tarefa = await prisma.tarefa.create({
    data: {
      projetoId: params.id,
      colunaId: coluna.id,
      titulo,
      descricao: body.descricao?.trim() || null,
      ordem: (ultima?.ordem ?? 0) + ORDEM_GAP,
      prioridade: ["BAIXA", "MEDIA", "ALTA", "URGENTE"].includes(body.prioridade) ? body.prioridade : "MEDIA",
      membros: { create: membroIds.map((usuarioId) => ({ usuarioId })) },
      dataInicio: body.dataInicio ? new Date(body.dataInicio) : null,
      prazo: body.prazo ? new Date(body.prazo) : null,
      concluidaEm: coluna.concluiTarefa ? new Date() : null,
    },
    select: { id: true, titulo: true },
  });

  await registrarAtividade({ projetoId: params.id, tarefaId: tarefa.id, autorId: auth.session.sub, tipo: "CRIOU" });
  for (const usuarioId of membroIds) {
    await notificarAtribuicao({
      responsavelId: usuarioId,
      autorId: auth.session.sub,
      autorNome: auth.session.nome,
      tarefaId: tarefa.id,
      tarefaTitulo: tarefa.titulo,
      projetoId: params.id,
      projetoNome: acesso.projeto.nome,
    });
  }
  return NextResponse.json({ data: tarefa }, { status: 201 });
}
