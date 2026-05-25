import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/suprimentos/estoque-items/[itemId]
// Admin-only: directly update an EstoqueItem record (saldo + localizacao)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { itemId: string } }
) {
  const body = await req.json();
  const { quantidadeAtual, localizacao } = body;

  const data: Record<string, unknown> = {};
  if (quantidadeAtual !== undefined)
    data.quantidadeAtual = parseFloat(String(quantidadeAtual)) || 0;
  if (localizacao !== undefined)
    data.localizacao = localizacao?.trim() || null;

  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });

  const updated = await prisma.estoqueItem.update({
    where: { id: params.itemId },
    data,
  });

  return NextResponse.json({ data: updated });
}
