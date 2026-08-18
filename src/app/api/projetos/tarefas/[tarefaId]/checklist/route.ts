export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto, podeEditarTarefas, registrarAtividade, notificarAtribuicao } from "@/lib/projetos";

async function autorizar(session: { sub: string; perfil: "ADMIN" | "USUARIO" }, tarefaId: string) {
  const tarefa = await prismaSemEscopo.tarefa.findUnique({ where: { id: tarefaId }, select: { projetoId: true, titulo: true } });
  if (!tarefa) return null;
  const acesso = await nivelNoProjeto(session, tarefa.projetoId);
  if (!acesso || !podeEditarTarefas(acesso.nivel)) return null;
  return { tarefa, acesso };
}

// POST — { texto } adiciona; PATCH — { id, feito?, texto?, responsavelId? };
// PUT — { ids } reordena; DELETE ?id=
export async function POST(req: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  if (!(await autorizar(auth.session, params.tarefaId))) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });

  const body = await req.json();
  const texto = String(body.texto ?? "").trim();
  if (!texto) return NextResponse.json({ error: "Informe o texto." }, { status: 400 });

  const ultimo = await prismaSemEscopo.tarefaChecklistItem.findFirst({
    where: { tarefaId: params.tarefaId }, orderBy: { ordem: "desc" }, select: { ordem: true },
  });
  const item = await prismaSemEscopo.tarefaChecklistItem.create({
    data: { tarefaId: params.tarefaId, texto, ordem: (ultimo?.ordem ?? 0) + 1 },
  });
  return NextResponse.json({ data: item }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const ctx = await autorizar(auth.session, params.tarefaId);
  if (!ctx) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
  const item = await prismaSemEscopo.tarefaChecklistItem.findFirst({
    where: { id: body.id, tarefaId: params.tarefaId }, select: { feito: true, texto: true },
  });
  if (!item) return NextResponse.json({ ok: true });
  const data: Record<string, unknown> = {};
  if (body.feito !== undefined) data.feito = !!body.feito;
  if (body.texto !== undefined) {
    const texto = String(body.texto).trim();
    if (!texto) return NextResponse.json({ error: "Texto não pode ficar vazio." }, { status: 400 });
    data.texto = texto;
  }
  // Responsável do item: string atribui, null/"" remove (FK valida o usuário).
  if (body.responsavelId !== undefined) data.responsavelId = body.responsavelId || null;
  await prismaSemEscopo.tarefaChecklistItem.updateMany({ where: { id: body.id, tarefaId: params.tarefaId }, data });

  // Concluir/desmarcar item entra no feed de atividade do cartão.
  if (body.feito !== undefined && !!body.feito !== item.feito) {
    await registrarAtividade({
      projetoId: ctx.tarefa.projetoId, tarefaId: params.tarefaId, autorId: auth.session.sub,
      tipo: body.feito ? "CHECK_CONCLUIU" : "CHECK_REABRIU", detalhe: { item: item.texto },
    });
  }

  // Responsável de item que ainda não participa do cartão vira membro também.
  if (body.responsavelId) {
    const novo = await prismaSemEscopo.tarefaMembro.createMany({
      data: [{ tarefaId: params.tarefaId, usuarioId: body.responsavelId }],
      skipDuplicates: true,
    });
    if (novo.count > 0) {
      await registrarAtividade({
        projetoId: ctx.tarefa.projetoId, tarefaId: params.tarefaId, autorId: auth.session.sub,
        tipo: "ATRIBUIU", detalhe: { membros: 1 },
      });
      await notificarAtribuicao({
        responsavelId: body.responsavelId,
        autorId: auth.session.sub,
        autorNome: auth.session.nome,
        tarefaId: params.tarefaId,
        tarefaTitulo: ctx.tarefa.titulo,
        projetoId: ctx.tarefa.projetoId,
        projetoNome: ctx.acesso.projeto.nome,
      });
    }
  }
  return NextResponse.json({ ok: true });
}

// PUT — { ids: string[] } reordena os itens na ordem recebida (drag na UI).
export async function PUT(req: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  if (!(await autorizar(auth.session, params.tarefaId))) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });

  const body = await req.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((i: unknown) => typeof i === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "ids obrigatório." }, { status: 400 });

  await prismaSemEscopo.$transaction(
    ids.map((id, idx) =>
      prismaSemEscopo.tarefaChecklistItem.updateMany({
        where: { id, tarefaId: params.tarefaId },
        data: { ordem: idx + 1 },
      }),
    ),
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  if (!(await autorizar(auth.session, params.tarefaId))) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
  await prismaSemEscopo.tarefaChecklistItem.deleteMany({ where: { id, tarefaId: params.tarefaId } });
  return NextResponse.json({ ok: true });
}
