export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hashPassword } from "@/lib/auth";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.perfil !== "ADMIN") return null;
  return session;
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const users = await prisma.usuario.findMany({
    orderBy: { nome: "asc" },
    include: {
      permissoes:  { select: { modulo: true } },
      perfilAcesso: { select: { id: true, nome: true } },
    },
  });
  return NextResponse.json(users.map((u) => ({ ...u, senha: undefined })));
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const { nome, email, senha, perfil, perfilAcessoId } = await req.json();
  if (!nome?.trim() || !email?.trim() || !senha?.trim()) {
    return NextResponse.json({ error: "Nome, e-mail e senha são obrigatórios" }, { status: 400 });
  }
  try {
    const hash = await hashPassword(senha);
    const user = await prisma.usuario.create({
      data: {
        nome:          nome.trim(),
        email:         email.toLowerCase().trim(),
        senha:         hash,
        perfil:        perfil ?? "USUARIO",
        perfilAcessoId: perfilAcessoId || null,
      },
    });
    return NextResponse.json({ ...user, senha: undefined }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 409 });
  }
}
