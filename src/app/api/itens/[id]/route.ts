export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const item = await prisma.item.findUnique({
    where: { id: params.id },
    include: {
      estoqueItems: { include: { localEstoque: true } },
      movimentacoes: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!item) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
  return NextResponse.json({ data: item });
}

// Edição legada desativada: o cadastro é editado em /api/suprimentos/produtos/[id].
export async function PUT() {
  return NextResponse.json({ error: "Edite o produto em Suprimentos › Produtos." }, { status: 410 });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  await prisma.item.update({ where: { id: params.id }, data: { ativo: false } });
  return NextResponse.json({ data: { ok: true } });
}
