export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { recalcularCustoOrdem } from "@/lib/manutencao/ordem";

type Ctx = { params: Promise<{ id: string }> };

// POST { fornecedorId?, descricao, valor, pedidoCompraId?, contaPagarId? } — serviço externo da OS.
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const os = await prisma.manutOrdem.findUnique({ where: { id }, select: { status: true } });
  if (!os) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });
  if (["CONCLUIDA", "CANCELADA"].includes(os.status)) return NextResponse.json({ error: "OS concluída/cancelada — reabra para editar." }, { status: 422 });
  const b = await req.json().catch(() => ({}));
  if (!String(b.descricao ?? "").trim()) return NextResponse.json({ error: "Descreva o serviço." }, { status: 400 });
  const valor = Number(b.valor ?? 0);
  if (!Number.isFinite(valor) || valor < 0) return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  const t = await prismaSemEscopo.manutOrdemTerceiro.create({
    data: { ordemId: id, fornecedorId: b.fornecedorId || null, descricao: b.descricao.trim(), valor, pedidoCompraId: b.pedidoCompraId || null, contaPagarId: b.contaPagarId || null },
  });
  await recalcularCustoOrdem(id);
  return NextResponse.json({ data: t }, { status: 201 });
}

// DELETE ?terceiroId=
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const os = await prisma.manutOrdem.findUnique({ where: { id }, select: { status: true } });
  if (!os) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });
  if (["CONCLUIDA", "CANCELADA"].includes(os.status)) return NextResponse.json({ error: "OS concluída/cancelada — reabra para editar." }, { status: 422 });
  await prismaSemEscopo.manutOrdemTerceiro.deleteMany({ where: { id: req.nextUrl.searchParams.get("terceiroId") ?? "", ordemId: id } });
  await recalcularCustoOrdem(id);
  return NextResponse.json({ ok: true });
}
