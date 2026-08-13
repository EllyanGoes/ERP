export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto, podeGerenciarProjeto } from "@/lib/projetos";
import { notificarUsuario } from "@/lib/notificacoes";

// POST /api/projetos/[id]/membros — adiciona membros { usuarioIds: [] }.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const acesso = await nivelNoProjeto(auth.session, params.id);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  if (!podeGerenciarProjeto(acesso.nivel)) return NextResponse.json({ error: "Apenas dono/administradores gerenciam membros." }, { status: 403 });

  const body = await req.json();
  const ids: string[] = Array.isArray(body.usuarioIds) ? body.usuarioIds : [];
  if (ids.length === 0) return NextResponse.json({ error: "Selecione ao menos um usuário." }, { status: 400 });

  await prismaSemEscopo.projetoMembro.createMany({
    data: ids.map((usuarioId) => ({ projetoId: params.id, usuarioId })),
    skipDuplicates: true,
  });

  for (const usuarioId of ids) {
    if (usuarioId === auth.session.sub) continue;
    await notificarUsuario({
      usuarioId,
      tipo: "PROJETO_MEMBRO",
      titulo: `Você entrou no projeto ${acesso.projeto.nome}`,
      mensagem: `${auth.session.nome} adicionou você ao projeto.`,
      link: `/projetos/${params.id}`,
    });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

// PATCH /api/projetos/[id]/membros — { usuarioId?, papel? } (gestão) ou { favorito } (o próprio).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const acesso = await nivelNoProjeto(auth.session, params.id);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

  const body = await req.json();

  // Favorito é sempre do próprio usuário (cria vínculo leve se for só leitura/dono sem linha de membro)
  if (body.favorito !== undefined) {
    await prismaSemEscopo.projetoMembro.upsert({
      where: { projetoId_usuarioId: { projetoId: params.id, usuarioId: auth.session.sub } },
      create: { projetoId: params.id, usuarioId: auth.session.sub, favorito: !!body.favorito },
      update: { favorito: !!body.favorito },
    });
    return NextResponse.json({ ok: true });
  }

  if (!podeGerenciarProjeto(acesso.nivel)) return NextResponse.json({ error: "Apenas dono/administradores gerenciam membros." }, { status: 403 });
  if (!body.usuarioId) return NextResponse.json({ error: "usuarioId obrigatório." }, { status: 400 });
  await prismaSemEscopo.projetoMembro.updateMany({
    where: { projetoId: params.id, usuarioId: body.usuarioId },
    data: { papel: body.papel === "ADMIN" ? "ADMIN" : "MEMBRO" },
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/projetos/[id]/membros?usuarioId= — remove membro (ou sair do projeto).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const acesso = await nivelNoProjeto(auth.session, params.id);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

  const usuarioId = new URL(req.url).searchParams.get("usuarioId");
  if (!usuarioId) return NextResponse.json({ error: "usuarioId obrigatório." }, { status: 400 });
  const saindoDoProprio = usuarioId === auth.session.sub;
  if (!saindoDoProprio && !podeGerenciarProjeto(acesso.nivel)) {
    return NextResponse.json({ error: "Apenas dono/administradores removem membros." }, { status: 403 });
  }
  if (usuarioId === acesso.projeto.donoId) {
    return NextResponse.json({ error: "O dono não pode ser removido do projeto." }, { status: 400 });
  }
  await prismaSemEscopo.projetoMembro.deleteMany({ where: { projetoId: params.id, usuarioId } });
  return NextResponse.json({ ok: true });
}
