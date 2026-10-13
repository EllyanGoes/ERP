export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { salvarNaLixeira } from "@/lib/lixeira";
import { FICHA_INCLUDE, estornarEstoqueEntrega } from "@/lib/sst-epi";

// GET /api/sst/entregas/fichas/[id] — ficha completa (impressão do termo)
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const f = await prisma.sstEpiFicha.findUnique({ where: { id: params.id }, include: { ...FICHA_INCLUDE, empresa: { select: { razaoSocial: true, nomeFantasia: true, cnpj: true } } } });
  if (!f) return NextResponse.json({ error: "Ficha não encontrada" }, { status: 404 });
  return NextResponse.json({ data: f });
}

// PATCH /api/sst/entregas/fichas/[id] — { documentoId } anexa o termo assinado
// (propaga p/ as linhas) ou { observacoes }.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const f = await prisma.sstEpiFicha.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!f) return NextResponse.json({ error: "Ficha não encontrada" }, { status: 404 });
  const data = await prismaSemEscopo.$transaction(async (tx) => {
    if ("documentoId" in b) {
      const documentoId: string | null = b.documentoId || null;
      await tx.sstEpiEntrega.updateMany({ where: { fichaId: f.id }, data: { documentoId } });
      await tx.sstEpiFicha.update({ where: { id: f.id }, data: { documentoId, assinadaEm: documentoId ? new Date() : null, atualizadoPor: auth.session.nome } });
    }
    if ("observacoes" in b) await tx.sstEpiFicha.update({ where: { id: f.id }, data: { observacoes: b.observacoes?.trim() || null, atualizadoPor: auth.session.nome } });
    return tx.sstEpiFicha.findUnique({ where: { id: f.id }, include: FICHA_INCLUDE });
  });
  return NextResponse.json({ data });
}

// DELETE — desfaz a ficha inteira: estorna estoque de cada linha e manda p/ lixeira.
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const f = await prisma.sstEpiFicha.findUnique({ where: { id: params.id }, include: FICHA_INCLUDE });
  if (!f) return NextResponse.json({ error: "Ficha não encontrada" }, { status: 404 });
  await prismaSemEscopo.$transaction(async (tx) => {
    for (const it of f.itens) await estornarEstoqueEntrega(tx, it.movimentacaoEstoqueId);
    await salvarNaLixeira(tx, { empresaId: f.empresaId, tipo: "SST_REGISTRO", origemId: f.id, numero: `FICHA-${String(f.numero).padStart(4, "0")}`, descricao: `Ficha de EPI nº ${f.numero} — ${f.colaborador.nome} (${f.itens.length} itens)`, snapshot: f, apagadoPor: auth.session.nome });
    await tx.sstEpiEntrega.deleteMany({ where: { fichaId: f.id } });
    await tx.sstEpiFicha.delete({ where: { id: f.id } });
  });
  return NextResponse.json({ ok: true });
}
