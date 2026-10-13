export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.nome !== undefined) { const n = String(b.nome).trim(); if (!n) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 }); data.nome = n; }
  if (b.norma !== undefined) data.norma = b.norma?.trim() || null;
  if (b.cargaHoraria !== undefined) data.cargaHoraria = b.cargaHoraria ? Number(b.cargaHoraria) : null;
  if (b.validadeMeses !== undefined) data.validadeMeses = b.validadeMeses ? Number(b.validadeMeses) : null;
  if (b.ativo !== undefined) data.ativo = !!b.ativo;
  const t = await prisma.sstTreinamentoTipo.update({ where: { id: params.id }, data });
  return NextResponse.json({ data: t });
}
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const n = await prismaSemEscopo.sstTreinamento.count({ where: { tipoId: params.id } });
  if (n > 0) return NextResponse.json({ error: `Há ${n} turma(s) deste treinamento. Inative em vez de excluir.` }, { status: 400 });
  await prisma.sstTreinamentoTipo.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
