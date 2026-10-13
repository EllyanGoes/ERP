export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.nome !== undefined) { const n = String(b.nome).trim(); if (!n) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 }); data.nome = n; }
  if (b.norma !== undefined) data.norma = b.norma?.trim() || null;
  if (b.categoriaGedId !== undefined && b.categoriaGedId) data.categoriaGedId = b.categoriaGedId;
  if (b.periodicidadeMeses !== undefined) data.periodicidadeMeses = b.periodicidadeMeses ? Number(b.periodicidadeMeses) : null;
  if (b.responsavelId !== undefined) data.responsavelId = b.responsavelId || null;
  if (b.observacoes !== undefined) data.observacoes = b.observacoes?.trim() || null;
  const o = await prisma.sstObrigacao.update({ where: { id: params.id }, data });
  return NextResponse.json({ data: o });
}
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  await prisma.sstObrigacao.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
