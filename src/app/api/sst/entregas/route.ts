export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { salvarNaLixeira } from "@/lib/lixeira";

const INCLUDE = {
  epi: { select: { id: true, nome: true, ca: true, vidaUtilDias: true, itemId: true } },
  colaborador: { select: { id: true, nome: true } },
};

// GET /api/sst/entregas?colaboradorId=&epiId=&dias=
export async function GET(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const sp = new URL(req.url).searchParams;
  const colaboradorId = sp.get("colaboradorId");
  const epiId = sp.get("epiId");
  const dias = parseInt(sp.get("dias") ?? "0");
  const data = await prisma.sstEpiEntrega.findMany({
    where: {
      ...(colaboradorId ? { colaboradorId } : {}),
      ...(epiId ? { epiId } : {}),
      ...(dias > 0 ? { data: { gte: new Date(Date.now() - dias * 86_400_000) } } : {}),
    },
    orderBy: { data: "desc" },
    take: 500,
    include: INCLUDE,
  });
  return NextResponse.json({ data });
}

// POST /api/sst/entregas — uma entrega (ou várias: { colaboradorIds: [] })
// { colaboradorId | colaboradorIds, epiId, tipo, quantidade, data, motivo, documentoId?, localEstoqueId? }
// Com localEstoqueId e EPI ligado a item do almoxarifado: dá SAÍDA de estoque
// (hard block sem saldo, como no resto do sistema).
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const ids: string[] = Array.isArray(b.colaboradorIds) ? b.colaboradorIds : b.colaboradorId ? [b.colaboradorId] : [];
  if (ids.length === 0) return NextResponse.json({ error: "Informe o colaborador." }, { status: 400 });
  if (!b.epiId) return NextResponse.json({ error: "Informe o EPI." }, { status: 400 });
  const tipo = ["ENTREGA", "TROCA", "DEVOLUCAO"].includes(b.tipo) ? b.tipo : "ENTREGA";
  const quantidade = Math.max(1, Number(b.quantidade) || 1);
  const data = b.data ? new Date(b.data) : new Date();
  const epi = await prisma.sstEpi.findUnique({ where: { id: b.epiId }, select: { id: true, nome: true, vidaUtilDias: true, itemId: true, item: { select: { descricao: true } } } });
  if (!epi) return NextResponse.json({ error: "EPI não encontrado" }, { status: 404 });
  const vencimentoUso = tipo !== "DEVOLUCAO" && epi.vidaUtilDias ? new Date(data.getTime() + epi.vidaUtilDias * 86_400_000) : null;
  const localEstoqueId: string | null = b.localEstoqueId || null;
  const baixaEstoque = tipo !== "DEVOLUCAO" && !!epi.itemId && !!localEstoqueId;

  try {
    const criadas = await prismaSemEscopo.$transaction(async (tx) => {
      const out = [];
      for (const colaboradorId of ids) {
        let movimentacaoEstoqueId: string | null = null;
        if (baixaEstoque) {
          const estoque = await tx.estoqueItem.findFirst({
            where: { empresaId, itemId: epi.itemId!, localEstoqueId: localEstoqueId!, clienteDonoId: null },
            select: { id: true, quantidadeAtual: true },
          });
          const saldo = Number(estoque?.quantidadeAtual ?? 0);
          if (!estoque || saldo < quantidade) {
            throw new Error(`Sem saldo de "${epi.item?.descricao ?? epi.nome}" no local escolhido (saldo ${saldo}, precisa ${quantidade}).`);
          }
          await tx.estoqueItem.update({ where: { id: estoque.id }, data: { quantidadeAtual: saldo - quantidade } });
          const colab = await tx.colaborador.findUnique({ where: { id: colaboradorId }, select: { nome: true } });
          const mov = await tx.movimentacaoEstoque.create({
            data: {
              empresaId, itemId: epi.itemId!, tipo: "SAIDA", quantidade, saldoAntes: saldo, saldoDepois: saldo - quantidade,
              localEstoqueId, data, documento: "EPI", observacoes: `Entrega de EPI — ${colab?.nome ?? colaboradorId}`,
              criadoPor: auth.session.nome,
            },
            select: { id: true },
          });
          movimentacaoEstoqueId = mov.id;
        }
        const e = await tx.sstEpiEntrega.create({
          data: {
            empresaId, colaboradorId, epiId: epi.id, tipo, quantidade, data,
            motivo: b.motivo?.trim() || null, vencimentoUso, movimentacaoEstoqueId, documentoId: b.documentoId || null,
            criadoPor: auth.session.nome,
          },
          include: INCLUDE,
        });
        out.push(e);
      }
      return out;
    });
    return NextResponse.json({ data: criadas }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao registrar entrega" }, { status: 400 });
  }
}

// DELETE /api/sst/entregas?id= — estorna a saída de estoque (se houve) e manda p/ lixeira.
export async function DELETE(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const e = await prisma.sstEpiEntrega.findUnique({ where: { id }, include: INCLUDE });
  if (!e) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });
  await prismaSemEscopo.$transaction(async (tx) => {
    if (e.movimentacaoEstoqueId) {
      const mov = await tx.movimentacaoEstoque.findUnique({ where: { id: e.movimentacaoEstoqueId }, select: { id: true, itemId: true, localEstoqueId: true, quantidade: true, empresaId: true } });
      if (mov) {
        const estoque = await tx.estoqueItem.findFirst({ where: { empresaId: mov.empresaId, itemId: mov.itemId, localEstoqueId: mov.localEstoqueId, clienteDonoId: null }, select: { id: true, quantidadeAtual: true } });
        if (estoque) await tx.estoqueItem.update({ where: { id: estoque.id }, data: { quantidadeAtual: Number(estoque.quantidadeAtual) + Number(mov.quantidade) } });
        await tx.movimentacaoEstoque.delete({ where: { id: mov.id } });
      }
    }
    await salvarNaLixeira(tx, { empresaId: e.empresaId, tipo: "SST_REGISTRO", origemId: e.id, numero: null, descricao: `Entrega de EPI ${e.epi.nome} — ${e.colaborador.nome}`, snapshot: e, apagadoPor: auth.session.nome });
    await tx.sstEpiEntrega.delete({ where: { id } });
  });
  return NextResponse.json({ ok: true });
}
