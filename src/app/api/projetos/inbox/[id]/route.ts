export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { INBOX_SELECT } from "@/lib/projetos";

async function carregar(usuarioId: string, id: string) {
  return prismaSemEscopo.tarefaInbox.findFirst({ where: { id, usuarioId }, select: { id: true } });
}

// PATCH /api/projetos/inbox/[id] — { titulo?, notas?, concluida? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  if (!(await carregar(auth.session.sub, params.id))) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.titulo !== undefined) {
    const t = String(body.titulo).trim();
    if (!t) return NextResponse.json({ error: "Título não pode ficar vazio." }, { status: 400 });
    data.titulo = t;
  }
  if (body.notas !== undefined) data.notas = typeof body.notas === "string" && body.notas.trim() ? body.notas.trim() : null;
  if (body.concluida !== undefined) data.concluidaEm = body.concluida ? new Date() : null;

  const item = await prismaSemEscopo.tarefaInbox.update({ where: { id: params.id }, data, select: INBOX_SELECT });
  return NextResponse.json({ data: item });
}

// DELETE /api/projetos/inbox/[id]
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  if (!(await carregar(auth.session.sub, params.id))) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
  await prismaSemEscopo.tarefaInbox.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
