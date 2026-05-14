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
  const perms = await prisma.permissao.findMany({ where: { usuarioId: params.id } });
  return NextResponse.json(perms.map((p) => p.modulo));
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const { modulos }: { modulos: string[] } = await req.json();
  // Replace all permissions
  await prisma.$transaction([
    prisma.permissao.deleteMany({ where: { usuarioId: params.id } }),
    ...(modulos.length > 0
      ? [prisma.permissao.createMany({
          data: modulos.map((m) => ({ usuarioId: params.id, modulo: m })),
        })]
      : []),
  ]);
  return NextResponse.json({ ok: true });
}
