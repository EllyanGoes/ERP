export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";

// POST { incidenteId | inspecaoId, descricao, responsavelId?, prazo? }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const descricao = String(b.descricao ?? "").trim();
  if (!descricao) return NextResponse.json({ error: "Descreva a ação." }, { status: 400 });
  if (!b.incidenteId && !b.inspecaoId) return NextResponse.json({ error: "Ação precisa de incidente ou inspeção." }, { status: 400 });
  if (b.incidenteId && !(await prisma.sstIncidente.findUnique({ where: { id: b.incidenteId }, select: { id: true } }))) return NextResponse.json({ error: "Incidente não encontrado" }, { status: 404 });
  if (b.inspecaoId && !(await prisma.sstInspecao.findUnique({ where: { id: b.inspecaoId }, select: { id: true } }))) return NextResponse.json({ error: "Inspeção não encontrada" }, { status: 404 });
  const a = await prismaSemEscopo.sstAcaoCorretiva.create({
    data: { incidenteId: b.incidenteId || null, inspecaoId: b.inspecaoId || null, descricao, responsavelId: b.responsavelId || null, prazo: b.prazo ? new Date(b.prazo) : null },
    include: { responsavel: { select: { id: true, nome: true } } },
  });
  if (b.incidenteId) await prisma.sstIncidente.updateMany({ where: { id: b.incidenteId, status: { in: ["ABERTO", "EM_INVESTIGACAO"] } }, data: { status: "ACAO_DEFINIDA" } });
  return NextResponse.json({ data: a }, { status: 201 });
}

// PATCH { id, descricao?, responsavelId?, prazo?, concluida?: boolean, tarefaId? }
export async function PATCH(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (b.descricao !== undefined) data.descricao = String(b.descricao).trim();
  if (b.responsavelId !== undefined) data.responsavelId = b.responsavelId || null;
  if (b.prazo !== undefined) data.prazo = b.prazo ? new Date(b.prazo) : null;
  if (b.concluida !== undefined) data.concluidaEm = b.concluida ? new Date() : null;
  if (b.tarefaId !== undefined) data.tarefaId = b.tarefaId || null;
  const a = await prismaSemEscopo.sstAcaoCorretiva.update({ where: { id: b.id }, data, include: { responsavel: { select: { id: true, nome: true } } } });
  return NextResponse.json({ data: a });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  await prismaSemEscopo.sstAcaoCorretiva.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
