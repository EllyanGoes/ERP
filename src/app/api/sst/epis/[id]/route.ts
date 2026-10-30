export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { salvarTamanhosEpi, conflitoItemEpi, type LinhaVariacaoEpi } from "@/lib/sst-epi";

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
  if (b.ativo !== undefined) data.ativo = !!b.ativo;
  if (b.descartavel !== undefined) data.descartavel = !!b.descartavel;
  // itens: [{ itemId, tamanho }] — grade de tamanhos; itemId sozinho = item único (legado).
  const novaGrade = Array.isArray(b.itens) || b.itemId !== undefined;
  const linhas: LinhaVariacaoEpi[] = Array.isArray(b.itens) ? b.itens : b.itemId ? [{ itemId: b.itemId }] : [];
  // Item já em outro EPI ativo: barra ao trocar a grade e ao reativar.
  const atual = await prismaSemEscopo.sstEpi.findUnique({ where: { id: params.id }, select: { empresaId: true, ativo: true, itens: { select: { itemId: true } } } });
  if (!atual) return NextResponse.json({ error: "EPI não encontrado" }, { status: 404 });
  const ficaAtivo = b.ativo !== undefined ? !!b.ativo : atual.ativo;
  if (ficaAtivo && (novaGrade || !atual.ativo)) {
    const itemIds = novaGrade ? linhas.map((l) => String(l.itemId ?? "")) : atual.itens.map((i) => i.itemId);
    const conflito = await conflitoItemEpi(prismaSemEscopo, { empresaId: atual.empresaId, epiId: params.id, itemIds });
    if (conflito) return NextResponse.json({ error: conflito }, { status: 409 });
  }
  const epi = await prisma.sstEpi.update({ where: { id: params.id }, data });
  if (novaGrade) {
    await prismaSemEscopo.$transaction((tx) => salvarTamanhosEpi(tx, epi.id, linhas));
  }
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
