export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Vínculo usuário ↔ empresa (multiempresa, Fase 3).
// ADMIN enxerga todas as empresas ativas independente do vínculo; para
// USUARIO, sem nenhum vínculo o acesso cai na Tramontin (padrão).

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.perfil !== "ADMIN") return null;
  return session;
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const vinculos = await prisma.usuarioEmpresa.findMany({ where: { usuarioId: params.id } });
  return NextResponse.json(vinculos.map((v) => v.empresaId));
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const { empresaIds }: { empresaIds: string[] } = await req.json();
  if (!Array.isArray(empresaIds)) {
    return NextResponse.json({ error: "empresaIds deve ser uma lista" }, { status: 400 });
  }
  // Replace all (mesmo padrão das permissões)
  await prisma.$transaction([
    prisma.usuarioEmpresa.deleteMany({ where: { usuarioId: params.id } }),
    ...(empresaIds.length > 0
      ? [prisma.usuarioEmpresa.createMany({
          data: empresaIds.map((empresaId) => ({ usuarioId: params.id, empresaId })),
        })]
      : []),
  ]);
  return NextResponse.json({ ok: true });
}
