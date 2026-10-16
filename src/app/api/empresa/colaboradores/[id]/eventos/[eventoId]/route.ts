export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModuloAny } from "@/lib/permissions";
import { prismaSemEscopo as prisma } from "@/lib/prisma";
import { salvarNaLixeira } from "@/lib/lixeira";
import { EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { TIPOS_EVENTO, aplicarEvento, reverterEvento } from "@/lib/colaborador-eventos";

type P = { params: { id: string; eventoId: string } };

// PATCH { data?, dataFim?, motivo?, detalhes?, observacao?, documentoId? } — ex.: registrar o retorno do afastamento.
export async function PATCH(req: NextRequest, { params }: P) {
  const auth = await requireModuloAny(["empresa", "rh"]);
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const atual = await prisma.colaboradorEvento.findFirst({ where: { id: params.eventoId, colaboradorId: params.id } });
  if (!atual) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
  const data: Record<string, unknown> = { atualizadoPor: auth.session.nome };
  if (b.data !== undefined) data.data = new Date(b.data);
  if (b.dataFim !== undefined) data.dataFim = b.dataFim ? new Date(b.dataFim) : null;
  if (b.motivo !== undefined) data.motivo = b.motivo || null;
  if (b.detalhes !== undefined) data.detalhes = b.detalhes;
  if (b.observacao !== undefined) data.observacao = String(b.observacao ?? "").trim() || null;
  if (b.documentoId !== undefined) data.documentoId = b.documentoId || null;
  const ev = await prisma.$transaction(async (tx) => {
    const ev = await tx.colaboradorEvento.update({ where: { id: atual.id }, data });
    if (ev.data.getTime() !== atual.data.getTime()) { await reverterEvento(tx, atual); await aplicarEvento(tx, ev); }
    return ev;
  });
  return NextResponse.json({ data: ev });
}

// DELETE — desfaz o efeito no cadastro e vai para a lixeira.
export async function DELETE(_: NextRequest, { params }: P) {
  const auth = await requireModuloAny(["empresa", "rh"]);
  if (!auth.ok) return auth.response;
  const ev = await prisma.colaboradorEvento.findFirst({ where: { id: params.eventoId, colaboradorId: params.id }, include: { colaborador: { select: { nome: true } } } });
  if (!ev) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await salvarNaLixeira(tx, { empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID, tipo: "EVENTO_COLABORADOR", origemId: ev.id, numero: null, descricao: `${TIPOS_EVENTO[ev.tipo].label} — ${ev.colaborador.nome}`, snapshot: ev, apagadoPor: auth.session.nome });
    await reverterEvento(tx, ev);
    await tx.colaboradorEvento.delete({ where: { id: ev.id } });
  });
  return NextResponse.json({ ok: true });
}
