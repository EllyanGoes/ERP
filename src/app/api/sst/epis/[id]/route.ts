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
  if (b.ca !== undefined) data.ca = b.ca?.trim() || null;
  if (b.caValidade !== undefined) data.caValidade = b.caValidade ? new Date(b.caValidade) : null;
  if (b.vidaUtilDias !== undefined) data.vidaUtilDias = b.vidaUtilDias ? Number(b.vidaUtilDias) : null;
  if (b.fabricante !== undefined) data.fabricante = b.fabricante?.trim() || null;
  if (b.itemId !== undefined) data.itemId = b.itemId || null;
  if (b.ativo !== undefined) data.ativo = !!b.ativo;
  const epi = await prisma.sstEpi.update({ where: { id: params.id }, data });
  return NextResponse.json({ data: epi });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const n = await prismaSemEscopo.sstEpiEntrega.count({ where: { epiId: params.id } });
  if (n > 0) return NextResponse.json({ error: `O EPI tem ${n} entrega(s) registrada(s). Inative em vez de excluir.` }, { status: 400 });
  await prisma.sstEpi.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
