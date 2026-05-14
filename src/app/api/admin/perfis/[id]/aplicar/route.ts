export const dynamic = "force-dynamic";
/**
 * POST /api/admin/perfis/[id]/aplicar
 * Reaaplica as permissões do perfil em todos os usuários vinculados a ele.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.perfil !== "ADMIN") return null;
  return session;
}

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const perfil = await prisma.perfilAcesso.findUnique({
    where: { id: params.id },
    include: { usuarios: { select: { id: true } } },
  });
  if (!perfil) return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });

  // Para cada usuário vinculado, substitui as permissões pelas do perfil
  await prisma.$transaction(
    perfil.usuarios.map((u) =>
      prisma.permissao.deleteMany({ where: { usuarioId: u.id } })
    )
  );

  const toCreate = perfil.usuarios.flatMap((u) =>
    perfil.permissoes.map((modulo) => ({ usuarioId: u.id, modulo }))
  );

  if (toCreate.length > 0) {
    await prisma.permissao.createMany({ data: toCreate, skipDuplicates: true });
  }

  return NextResponse.json({ ok: true, atualizados: perfil.usuarios.length });
}
