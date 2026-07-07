export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _: NextRequest,
  { params }: { params: { id: string; lancamentoId: string } },
) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const lancamento = await prisma.lancamentoManualMetrica.findUnique({
    where: { id: params.lancamentoId },
    select: { id: true, funilId: true },
  });
  if (!lancamento || lancamento.funilId !== params.id) {
    return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
  }

  // Hard delete: lançamento manual não tem filhos nem histórico dependente.
  await prisma.lancamentoManualMetrica.delete({ where: { id: params.lancamentoId } });
  return NextResponse.json({ data: { id: params.lancamentoId } });
}
