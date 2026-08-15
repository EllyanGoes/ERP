export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto, podeEditarTarefas } from "@/lib/projetos";

async function autorizar(session: { sub: string; perfil: "ADMIN" | "USUARIO" }, tarefaId: string) {
  const tarefa = await prismaSemEscopo.tarefa.findUnique({ where: { id: tarefaId }, select: { projetoId: true } });
  if (!tarefa) return null;
  const acesso = await nivelNoProjeto(session, tarefa.projetoId);
  if (!acesso || !podeEditarTarefas(acesso.nivel)) return null;
  return tarefa;
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
  if (!(await autorizar(auth.session, params.tarefaId))) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
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
