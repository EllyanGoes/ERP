export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { custosDaEmpresa } from "@/lib/custo-empresa";

// Custos ATUAIS dos itens na empresa dona da tabela (base do markup; fallback
// no CMPM global do Item). Não persiste — sempre o valor do momento.
async function custosDaTabela(tabela: { empresaId: string; itens: Array<{ itemId: string | null }> }) {
  const itemIds = tabela.itens.map((it) => it.itemId).filter((id): id is string => !!id);
  const mapa = await custosDaEmpresa(prisma, tabela.empresaId, itemIds);
  const custos: Record<string, number | null> = {};
  for (const [itemId, custo] of Array.from(mapa.entries())) custos[itemId] = custo;
  return custos;
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const tabela = await prisma.tabelaPreco.findUnique({
    where: { id: params.id },
    include: {
      itens: {
        include: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true, precoVenda: true } } },
        orderBy: { sequencia: "asc" },
      },
    },
  });
  if (!tabela) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ data: { ...tabela, custos: await custosDaTabela(tabela) } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { descricao, dataInicial, dataFinal, condicaoPagamento, tipoHorario, ativa, ecommerce, markupPadrao, observacoes, itens } = body;

  const data: Record<string, unknown> = {};
  if (descricao         !== undefined) data.descricao         = descricao.trim();
  if (dataInicial       !== undefined) data.dataInicial       = new Date(dataInicial);
  if (dataFinal         !== undefined) data.dataFinal         = dataFinal ? new Date(dataFinal) : null;
  if (condicaoPagamento !== undefined) data.condicaoPagamento = condicaoPagamento?.trim() || null;
  if (tipoHorario       !== undefined) data.tipoHorario       = tipoHorario;
  if (ativa             !== undefined) data.ativa             = Boolean(ativa);
  if (ecommerce         !== undefined) data.ecommerce         = Boolean(ecommerce);
  if (markupPadrao      !== undefined) data.markupPadrao      = markupPadrao != null && markupPadrao !== "" ? parseFloat(String(markupPadrao)) : null;
  if (observacoes       !== undefined) data.observacoes       = observacoes?.trim() || null;

  // If items are included, replace them
  if (Array.isArray(itens)) {
    await prisma.tabelaPrecoItem.deleteMany({ where: { tabelaPrecoId: params.id } });
    if (itens.length > 0) {
      await prisma.tabelaPrecoItem.createMany({
        data: itens.map((it: {
          itemId?: string; grupo?: string; precoBase?: number; precoVenda?: number;
          vlrDesconto?: number; markupPct?: number | null; ativo?: boolean; fator?: number; tipoOperacao?: string;
          faixa?: number; moeda?: string; sequencia: number;
        }) => ({
          tabelaPrecoId:  params.id,
          sequencia:      it.sequencia,
          itemId:         it.itemId || null,
          grupo:          it.grupo?.trim() || null,
          precoBase:      parseFloat(String(it.precoBase ?? 0)) || 0,
          precoVenda:     parseFloat(String(it.precoVenda ?? 0)) || 0,
          vlrDesconto:    parseFloat(String(it.vlrDesconto ?? 0)) || 0,
          markupPct:      it.markupPct != null && String(it.markupPct) !== "" ? parseFloat(String(it.markupPct)) : null,
          ativo:          it.ativo ?? true,
          fator:          parseFloat(String(it.fator ?? 0)) || 0,
          tipoOperacao:   it.tipoOperacao?.trim() || null,
          faixa:          it.faixa != null ? parseFloat(String(it.faixa)) : null,
          moeda:          it.moeda ?? "BRL",
        })),
      });
    }
  }

  const updated = await prisma.tabelaPreco.update({
    where: { id: params.id },
    data,
    include: {
      itens: {
        include: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true, precoVenda: true } } },
        orderBy: { sequencia: "asc" },
      },
    },
  });

  return NextResponse.json({ data: { ...updated, custos: await custosDaTabela(updated) } });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  await prisma.tabelaPreco.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
