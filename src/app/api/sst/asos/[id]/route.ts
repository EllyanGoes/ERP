export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { salvarNaLixeira } from "@/lib/lixeira";

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const aso = await prisma.sstAso.findUnique({ where: { id: params.id }, include: { exames: true, colaborador: { select: { nome: true } } } });
  if (!aso) return NextResponse.json({ error: "ASO não encontrado" }, { status: 404 });
  await prismaSemEscopo.$transaction(async (tx) => {
    await salvarNaLixeira(tx, { empresaId: aso.empresaId, tipo: "SST_REGISTRO", origemId: aso.id, numero: null, descricao: `ASO ${aso.tipo} — ${aso.colaborador.nome}`, snapshot: aso, apagadoPor: auth.session.nome });
    await tx.sstAso.delete({ where: { id: params.id } });
  });
  return NextResponse.json({ ok: true });
}
