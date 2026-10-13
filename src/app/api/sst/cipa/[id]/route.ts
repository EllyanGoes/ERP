export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";

const INCLUDE = { membros: { include: { colaborador: { select: { id: true, nome: true } } } }, reunioes: { orderBy: { data: "desc" as const } } };

// PATCH { inicio?, fim?, ataEleicaoDocumentoId?, observacoes?, membros?: [...] (substitui) }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.inicio !== undefined) data.inicio = new Date(b.inicio);
  if (b.fim !== undefined) data.fim = new Date(b.fim);
  if (b.ataEleicaoDocumentoId !== undefined) data.ataEleicaoDocumentoId = b.ataEleicaoDocumentoId || null;
  if (b.observacoes !== undefined) data.observacoes = b.observacoes?.trim() || null;
  const m = await prismaSemEscopo.$transaction(async (tx) => {
    if (Array.isArray(b.membros)) {
      await tx.sstCipaMembro.deleteMany({ where: { mandatoId: params.id } });
      await tx.sstCipaMembro.createMany({ data: (b.membros as { colaboradorId: string; papel?: string; representa?: string }[]).filter((x) => x?.colaboradorId).map((x) => ({ mandatoId: params.id, colaboradorId: x.colaboradorId, papel: x.papel || "TITULAR", representa: x.representa || "EMPREGADOS" })), skipDuplicates: true });
    }
    return tx.sstCipaMandato.update({ where: { id: params.id }, data, include: INCLUDE });
  });
  return NextResponse.json({ data: m });
}

// POST — nova reunião { data, pauta?, ataDocumentoId? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const mandato = await prisma.sstCipaMandato.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!mandato) return NextResponse.json({ error: "Mandato não encontrado" }, { status: 404 });
  const r = await prismaSemEscopo.sstCipaReuniao.create({ data: { mandatoId: params.id, data: b.data ? new Date(b.data) : new Date(), pauta: b.pauta?.trim() || null, ataDocumentoId: b.ataDocumentoId || null } });
  return NextResponse.json({ data: r }, { status: 201 });
}

// DELETE ?reuniaoId= (reunião) | sem query (mandato inteiro)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const reuniaoId = new URL(req.url).searchParams.get("reuniaoId");
  if (reuniaoId) { await prismaSemEscopo.sstCipaReuniao.deleteMany({ where: { id: reuniaoId, mandatoId: params.id } }); return NextResponse.json({ ok: true }); }
  await prisma.sstCipaMandato.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
