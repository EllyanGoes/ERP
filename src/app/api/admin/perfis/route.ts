export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.perfil !== "ADMIN") return null;
  return session;
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const perfis = await prisma.perfilAcesso.findMany({
    orderBy: { nome: "asc" },
    include: { _count: { select: { usuarios: true } } },
  });
  return NextResponse.json(perfis);
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const body = await req.json();
  if (!body.nome?.trim()) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  try {
    const perfil = await prisma.perfilAcesso.create({
      data: {
        nome:       body.nome.trim(),
        descricao:  body.descricao?.trim() || null,
        permissoes: Array.isArray(body.permissoes) ? body.permissoes : [],
      },
    });
    return NextResponse.json(perfil, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Nome já em uso" }, { status: 409 });
  }
}
