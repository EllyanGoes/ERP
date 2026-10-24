export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { novoQrToken } from "@/lib/manutencao/publico";

// PATCH /api/pcm/ativos/[codApl]/qr — gera um NOVO código para a etiqueta do
// ativo. A etiqueta antiga (e qualquer link /ativo/<código antigo> que tenha
// circulado) deixa de funcionar na hora — use quando a etiqueta vazou/foi
// trocada de máquina ou para reimprimir do zero.
export async function PATCH(_req: NextRequest, { params }: { params: { codApl: string } }) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const codApl = Number(params.codApl);
  if (!Number.isInteger(codApl) || codApl <= 0) return NextResponse.json({ error: "codApl inválido" }, { status: 400 });
  const ativo = await prisma.manutAtivo.findUnique({ where: { codApl }, select: { id: true } });
  if (!ativo) return NextResponse.json({ error: "Ativo não encontrado nesta empresa." }, { status: 404 });
  const qrToken = novoQrToken();
  await prisma.manutAtivo.update({ where: { id: ativo.id }, data: { qrToken } });
  return NextResponse.json({ data: { id: ativo.id, qrToken } });
}
