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
  const f = await prisma.sstEpiFicha.findUnique({ where: { id: params.id }, include: { ...FICHA_INCLUDE, empresa: { select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true, telefone: true, logradouro: true, numero: true, bairro: true, cidade: true, estado: true } } } });
  if (!f) return NextResponse.json({ error: "Ficha não encontrada" }, { status: 404 });
  return NextResponse.json({ data: f });
}

// PATCH /api/sst/entregas/fichas/[id] — { documentoId } anexa o termo assinado
// (propaga p/ as linhas; na ficha de histórico também a fecha), { fechar } /
// { reabrir } (só histórico: fechar deixa a próxima entrega abrir outra ficha),
// { observacoes } ou { data } (só termo avulso: data da entrega vale p/ as
// linhas, o vencimento de uso e a saída de estoque).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const f = await prisma.sstEpiFicha.findUnique({ where: { id: params.id }, select: { id: true, historico: true, fechadaEm: true, colaboradorId: true } });
  if (!f) return NextResponse.json({ error: "Ficha não encontrada" }, { status: 404 });
  if (!f.historico && (b.fechar || b.reabrir)) return NextResponse.json({ error: "Só a ficha de histórico é aberta/fechada." }, { status: 400 });
  if (f.historico && "data" in b) return NextResponse.json({ error: "Na ficha de histórico cada linha tem a própria data." }, { status: 400 });
  if (b.reabrir) {
    const outra = await prisma.sstEpiFicha.findFirst({ where: { colaboradorId: f.colaboradorId, historico: true, fechadaEm: null, id: { not: f.id } }, select: { numero: true } });
    if (outra) return NextResponse.json({ error: `O colaborador já tem a ficha nº ${String(outra.numero).padStart(4, "0")} aberta.` }, { status: 409 });
  }
  const data = await prismaSemEscopo.$transaction(async (tx) => {
    if ("documentoId" in b) {
      const documentoId: string | null = b.documentoId || null;
      await tx.sstEpiEntrega.updateMany({ where: { fichaId: f.id }, data: { documentoId } });
      await tx.sstEpiFicha.update({ where: { id: f.id }, data: { documentoId, assinadaEm: documentoId ? new Date() : null, atualizadoPor: auth.session.nome } });
    }
    // Papel arquivado = ficha encerrada.
    if (f.historico && !f.fechadaEm && (b.fechar || b.documentoId)) await tx.sstEpiFicha.update({ where: { id: f.id }, data: { fechadaEm: new Date(), atualizadoPor: auth.session.nome } });
    if (f.historico && b.reabrir) await tx.sstEpiFicha.update({ where: { id: f.id }, data: { fechadaEm: null, atualizadoPor: auth.session.nome } });
    if ("data" in b) {
      const data = new Date(b.data);
      if (isNaN(data.getTime())) throw new Error("Data inválida.");
      const itens = await tx.sstEpiEntrega.findMany({ where: { fichaId: f.id }, select: { id: true, tipo: true, movimentacaoEstoqueId: true, epi: { select: { vidaUtilDias: true } } } });
      for (const it of itens) {
        const vencimentoUso = it.tipo !== "DEVOLUCAO" && it.epi.vidaUtilDias ? new Date(data.getTime() + it.epi.vidaUtilDias * 86_400_000) : null;
        await tx.sstEpiEntrega.update({ where: { id: it.id }, data: { data, vencimentoUso } });
        if (it.movimentacaoEstoqueId) await tx.movimentacaoEstoque.update({ where: { id: it.movimentacaoEstoqueId }, data: { data } });
      }
      await tx.sstEpiFicha.update({ where: { id: f.id }, data: { data, atualizadoPor: auth.session.nome } });
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
