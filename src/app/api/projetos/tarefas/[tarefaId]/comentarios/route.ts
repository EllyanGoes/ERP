export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto, podeEditarTarefas, registrarAtividade, notificarMencoes } from "@/lib/projetos";
import { notificarUsuario } from "@/lib/notificacoes";

// POST — { texto }; PATCH — { id, texto } (só o autor); DELETE ?id= (autor ou dono/ADMIN).
export async function POST(req: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;

  const tarefa = await prismaSemEscopo.tarefa.findUnique({
    where: { id: params.tarefaId },
    select: { id: true, titulo: true, projetoId: true, criadoPor: true, membros: { select: { usuarioId: true } } },
  });
  if (!tarefa) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  const acesso = await nivelNoProjeto(auth.session, tarefa.projetoId);
  if (!acesso || !podeEditarTarefas(acesso.nivel)) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });

  const body = await req.json();
  const texto = String(body.texto ?? "").trim();
  if (!texto) return NextResponse.json({ error: "Comentário vazio." }, { status: 400 });

  const comentario = await prismaSemEscopo.tarefaComentario.create({
    data: { tarefaId: params.tarefaId, autorId: auth.session.sub, texto },
    select: { id: true, texto: true, createdAt: true, autor: { select: { id: true, nome: true } } },
  });

  await registrarAtividade({ projetoId: tarefa.projetoId, tarefaId: tarefa.id, autorId: auth.session.sub, tipo: "COMENTOU" });
  await notificarMencoes({
    texto,
    autorId: auth.session.sub,
    autorNome: auth.session.nome,
    tarefaId: tarefa.id,
    tarefaTitulo: tarefa.titulo,
    projetoId: tarefa.projetoId,
    projetoNome: acesso.projeto.nome,
  });
  // Membros do cartão são notificados de comentários (menos o autor)
  for (const { usuarioId } of tarefa.membros) {
    if (usuarioId === auth.session.sub) continue;
    await notificarUsuario({
      usuarioId,
      tipo: "PROJETO_COMENTARIO",
      titulo: `Comentário em "${tarefa.titulo}"`,
      mensagem: `${auth.session.nome}: ${texto.slice(0, 120)}`,
      link: `/projetos/${tarefa.projetoId}?tarefa=${tarefa.id}`,
    });
  }
  return NextResponse.json({ data: comentario }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
  const texto = String(body.texto ?? "").trim();
  if (!texto) return NextResponse.json({ error: "Comentário vazio." }, { status: 400 });

  const r = await prismaSemEscopo.tarefaComentario.updateMany({
    where: { id: body.id, tarefaId: params.tarefaId, autorId: auth.session.sub },
    data: { texto, editadoEm: new Date() },
  });
  if (r.count === 0) return NextResponse.json({ error: "Só o autor edita o comentário." }, { status: 403 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório." }, { status: 400 });

  const comentario = await prismaSemEscopo.tarefaComentario.findFirst({
    where: { id, tarefaId: params.tarefaId },
    select: { autorId: true, tarefa: { select: { projetoId: true } } },
  });
  if (!comentario) return NextResponse.json({ error: "Comentário não encontrado" }, { status: 404 });

  if (comentario.autorId !== auth.session.sub) {
    const acesso = await nivelNoProjeto(auth.session, comentario.tarefa.projetoId);
    if (!acesso || (acesso.nivel !== "DONO" && acesso.nivel !== "ADMIN")) {
      return NextResponse.json({ error: "Só o autor ou dono/administradores excluem." }, { status: 403 });
    }
  }
  await prismaSemEscopo.tarefaComentario.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
