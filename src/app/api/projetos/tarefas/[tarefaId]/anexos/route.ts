export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto, podeEditarTarefas } from "@/lib/projetos";

const MAX_MB = 20;

async function autorizar(session: { sub: string; perfil: "ADMIN" | "USUARIO" }, tarefaId: string, escrita: boolean) {
  const tarefa = await prismaSemEscopo.tarefa.findUnique({ where: { id: tarefaId }, select: { projetoId: true } });
  if (!tarefa) return null;
  const acesso = await nivelNoProjeto(session, tarefa.projetoId);
  if (!acesso) return null;
  if (escrita && !podeEditarTarefas(acesso.nivel)) return null;
  return acesso;
}

// GET — lista (formato do AnexosSection)
export async function GET(_: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  if (!(await autorizar(auth.session, params.tarefaId, false))) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });

  const anexos = await prismaSemEscopo.anexoTarefa.findMany({
    where: { tarefaId: params.tarefaId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data: anexos });
}

// POST — multipart upload p/ Vercel Blob (mesmo padrão dos anexos de título)
export async function POST(req: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  if (!(await autorizar(auth.session, params.tarefaId, true))) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (file.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `Máx. ${MAX_MB} MB por arquivo.` }, { status: 400 });

  const blob = await put(`projetos/tarefas/${params.tarefaId}/${Date.now()}-${file.name}`, file, { access: "public" });
  const anexo = await prisma.anexoTarefa.create({
    data: { tarefaId: params.tarefaId, nome: file.name, url: blob.url, tamanho: file.size, tipo: file.type || "application/octet-stream" },
  });
  return NextResponse.json({ data: anexo }, { status: 201 });
}

// DELETE ?id=
export async function DELETE(req: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  if (!(await autorizar(auth.session, params.tarefaId, true))) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
  await prismaSemEscopo.anexoTarefa.deleteMany({ where: { id, tarefaId: params.tarefaId } });
  return NextResponse.json({ ok: true });
}
