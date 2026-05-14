export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.perfil !== "ADMIN") return null;
  return session;
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const perfil = await prisma.perfilAcesso.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { usuarios: true } },
      usuarios: { select: { id: true, nome: true, email: true } },
    },
  });
  if (!perfil) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(perfil);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.nome       !== undefined) data.nome       = body.nome.trim();
  if (body.descricao  !== undefined) data.descricao  = body.descricao?.trim() || null;
  if (body.permissoes !== undefined) data.permissoes  = Array.isArray(body.permissoes) ? body.permissoes : [];
  try {
    const perfil = await prisma.perfilAcesso.update({ where: { id: params.id }, data });
    return NextResponse.json(perfil);
  } catch {
    return NextResponse.json({ error: "Nome já em uso" }, { status: 409 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  // Desvincula usuários antes de deletar
  await prisma.usuario.updateMany({
    where:  { perfilAcessoId: params.id },
    data:   { perfilAcessoId: null },
  });
  await prisma.perfilAcesso.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
