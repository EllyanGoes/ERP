export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { ofxConciliarSchema } from "@/lib/validations/financeiro";

// Concilia uma linha OFX a um lançamento existente.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = ofxConciliarSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const { linhaId, lancamentoId } = parsed.data;
  const result = await prisma.$transaction(async (tx) => {
    await tx.lancamentoFinanceiro.update({ where: { id: lancamentoId }, data: { conciliado: true } });
    return tx.linhaOFX.update({ where: { id: linhaId }, data: { lancamentoConciliadoId: lancamentoId } });
  });
  return NextResponse.json({ data: result });
}

// Desfaz a conciliação de uma linha OFX (?linhaId=...).
export async function DELETE(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const linhaId = searchParams.get("linhaId");
  if (!linhaId) return NextResponse.json({ error: "linhaId é obrigatório" }, { status: 400 });

  const linha = await prisma.linhaOFX.findUnique({ where: { id: linhaId } });
  if (!linha) return NextResponse.json({ error: "Linha não encontrada" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    if (linha.lancamentoConciliadoId) {
      await tx.lancamentoFinanceiro.update({ where: { id: linha.lancamentoConciliadoId }, data: { conciliado: false } });
    }
    await tx.linhaOFX.update({ where: { id: linhaId }, data: { lancamentoConciliadoId: null } });
  });
  return NextResponse.json({ data: { ok: true } });
}
