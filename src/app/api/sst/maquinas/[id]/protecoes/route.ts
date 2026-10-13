export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";

// POST { descricao, tipo? } — nova proteção exigida.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const descricao = String(b.descricao ?? "").trim();
  if (!descricao) return NextResponse.json({ error: "Descreva a proteção." }, { status: 400 });
  const m = await prisma.sstMaquina.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!m) return NextResponse.json({ error: "Máquina não encontrada" }, { status: 404 });
  const p = await prismaSemEscopo.sstMaquinaProtecao.create({ data: { maquinaId: params.id, descricao, tipo: b.tipo?.trim() || null } });
  return NextResponse.json({ data: p }, { status: 201 });
}

// PATCH { protecaoId, conforme?, evidenciaDocumentoId?, descricao?, tipo?, observacoes? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  if (!b.protecaoId) return NextResponse.json({ error: "protecaoId obrigatório" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (b.descricao !== undefined) data.descricao = String(b.descricao).trim();
  if (b.tipo !== undefined) data.tipo = b.tipo?.trim() || null;
  if (b.observacoes !== undefined) data.observacoes = b.observacoes?.trim() || null;
  if (b.evidenciaDocumentoId !== undefined) data.evidenciaDocumentoId = b.evidenciaDocumentoId || null;
  if (b.conforme !== undefined) { data.conforme = !!b.conforme; data.verificadoEm = b.conforme ? new Date() : null; }
  const r = await prismaSemEscopo.sstMaquinaProtecao.updateMany({ where: { id: b.protecaoId, maquinaId: params.id }, data });
  if (r.count === 0) return NextResponse.json({ error: "Proteção não encontrada" }, { status: 404 });
  // Voltou a ter pendência → máquina CONFORME cai para EM_ADEQUACAO.
  if (b.conforme === false) await prisma.sstMaquina.updateMany({ where: { id: params.id, status: "CONFORME" }, data: { status: "EM_ADEQUACAO" } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const protecaoId = new URL(req.url).searchParams.get("protecaoId") ?? "";
  await prismaSemEscopo.sstMaquinaProtecao.deleteMany({ where: { id: protecaoId, maquinaId: params.id } });
  return NextResponse.json({ ok: true });
}
