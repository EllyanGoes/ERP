export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { itemSchema } from "@/lib/validations/item";

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

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = itemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { quantidadeMin, quantidadeMax, localizacao, ...itemData } = parsed.data;

  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.item.update({ where: { id: params.id }, data: itemData });
    // Update first stock record (no specific location) or create one
    const existing = await tx.estoqueItem.findFirst({ where: { itemId: params.id, localEstoqueId: null, clienteDonoId: null } });
    if (existing) {
      await tx.estoqueItem.update({
        where: { id: existing.id },
        data: { quantidadeMin: quantidadeMin ?? 0, quantidadeMax: quantidadeMax ?? null, localizacao: localizacao ?? null },
      });
    } else {
      await tx.estoqueItem.create({
        data: { itemId: params.id, quantidadeAtual: 0, quantidadeMin: quantidadeMin ?? 0, quantidadeMax: quantidadeMax ?? null, localizacao: localizacao ?? null, clienteDonoId: null },
      });
    }
    return updated;
  });

  return NextResponse.json({ data: item });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  await prisma.item.update({ where: { id: params.id }, data: { ativo: false } });
  return NextResponse.json({ data: { ok: true } });
}
