export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hashPassword } from "@/lib/auth";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.perfil !== "ADMIN") return null;
  return session;
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const user = await prisma.usuario.findUnique({
    where: { id: params.id },
    include: {
      permissoes:   { select: { modulo: true } },
      perfilAcesso: { select: { id: true, nome: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ ...user, senha: undefined });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.nome)                        data.nome          = body.nome.trim();
  if (body.email)                       data.email         = body.email.toLowerCase().trim();
  if (body.perfil)                      data.perfil        = body.perfil;
  if (typeof body.ativo === "boolean")  data.ativo         = body.ativo;
  if (body.senha)                       data.senha         = await hashPassword(body.senha);
  if ("perfilAcessoId" in body)         data.perfilAcessoId = body.perfilAcessoId || null;
  try {
    const user = await prisma.usuario.update({ where: { id: params.id }, data });
    return NextResponse.json({ ...user, senha: undefined });
  } catch {
    return NextResponse.json({ error: "E-mail já em uso" }, { status: 409 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  // Prevent self-deletion
  if (session.sub === params.id) {
    return NextResponse.json({ error: "Você não pode excluir sua própria conta" }, { status: 400 });
  }
  await prisma.usuario.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
