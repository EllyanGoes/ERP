export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { salvarNaLixeira } from "@/lib/lixeira";

// PATCH /api/sst/exames/:id { data?, resultado?, observacao?, documentoId?, asoId? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.data !== undefined) data.data = new Date(b.data);
  if (b.resultado !== undefined) data.resultado = b.resultado?.trim() || null;
  if (b.observacao !== undefined) data.observacao = b.observacao?.trim() || null;
  if (b.documentoId !== undefined) data.documentoId = b.documentoId || null;
  if (b.asoId !== undefined) data.asoId = b.asoId || null;
  const ex = await prisma.sstExame.update({ where: { id: params.id }, data });
  return NextResponse.json({ data: ex });
}

// DELETE — vai para a lixeira.
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const ex = await prisma.sstExame.findUnique({ where: { id: params.id }, include: { exameTipo: { select: { nome: true } }, colaborador: { select: { nome: true } } } });
  if (!ex) return NextResponse.json({ error: "Exame não encontrado" }, { status: 404 });
  await prismaSemEscopo.$transaction(async (tx) => {
    await salvarNaLixeira(tx, { empresaId: ex.empresaId, tipo: "SST_REGISTRO", origemId: ex.id, numero: null, descricao: `Exame ${ex.exameTipo.nome} — ${ex.colaborador.nome}`, snapshot: ex, apagadoPor: auth.session.nome });
    await tx.sstExame.delete({ where: { id: ex.id } });
  });
  return NextResponse.json({ ok: true });
}
