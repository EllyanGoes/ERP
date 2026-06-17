export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { reabrirExercicio } from "@/lib/contabilidade";

// POST → reabre o exercício do fechamento informado (só o último encerrado).
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const fechamento = await prisma.fechamentoContabil.findUnique({
    where: { id: params.id }, select: { empresaId: true, exercicio: true },
  });
  if (!fechamento) return NextResponse.json({ error: "Fechamento não encontrado" }, { status: 404 });

  try {
    const r = await reabrirExercicio(fechamento.empresaId, fechamento.exercicio);
    return NextResponse.json({ data: r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
