export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * POST /api/admin/recalcular-custo-medio
 *
 * Recalcula o Custo Médio Ponderado Móvel (CMPM) de todos os itens com base
 * no histórico de conferências de compra (vlrUnitario), em ordem cronológica.
 *
 * Só atualiza itens que têm ao menos uma conferência com vlrUnitario > 0.
 * Restrito a ADMIN.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (session.perfil !== "ADMIN") return NextResponse.json({ error: "Apenas administradores" }, { status: 403 });

  // Buscar todos os itens de conferência com preço, em ordem cronológica
  const itensConferencia = await prisma.conferenciaCompraItem.findMany({
    where: {
      vlrUnitario:        { not: null },
      quantidadeRecebida: { gt: 0 },
      conferencia: { status: { in: ["CONCLUIDA", "DIVERGENCIA"] } },
    },
    select: {
      itemId:             true,
      quantidadeRecebida: true,
      vlrUnitario:        true,
      conferencia:        { select: { createdAt: true } },
    },
    orderBy: { conferencia: { createdAt: "asc" } },
  });

  if (itensConferencia.length === 0) {
    return NextResponse.json({ ok: true, atualizados: 0, detalhes: [] });
  }

  // Agrupar por itemId e calcular CMPM em ordem cronológica (replay)
  const cmpmPorItem = new Map<string, number>();

  for (const ci of itensConferencia) {
    const vlr = parseFloat(String(ci.vlrUnitario));
    const qty  = parseFloat(String(ci.quantidadeRecebida));
    if (!vlr || !qty || vlr <= 0 || qty <= 0) continue;

    const custoAtual = cmpmPorItem.get(ci.itemId) ?? 0;

    // Precisamos do estoque antes desta entrada para calcular o CMPM correto.
    // Como não temos snapshot histórico, usamos a fórmula simplificada:
    // acumulamos peso × preço e dividimos pelo total de quantidade acumulada.
    // Isso é equivalente ao CMPM para itens que partem de saldo zero.
    //
    // Para itens que já tinham precoCusto definido (entradas manuais anteriores),
    // usamos o valor existente no banco como base.
    cmpmPorItem.set(ci.itemId, vlr); // será substituído abaixo pelo cálculo correto
  }

  // Recalcular corretamente: replay sequencial por item
  const acumulado = new Map<string, { saldo: number; custo: number }>();

  for (const ci of itensConferencia) {
    const vlr = parseFloat(String(ci.vlrUnitario));
    const qty  = parseFloat(String(ci.quantidadeRecebida));
    if (!vlr || !qty || vlr <= 0 || qty <= 0) continue;

    const prev    = acumulado.get(ci.itemId) ?? { saldo: 0, custo: 0 };
    const novoCusto = prev.saldo > 0
      ? (prev.saldo * prev.custo + qty * vlr) / (prev.saldo + qty)
      : vlr;

    acumulado.set(ci.itemId, { saldo: prev.saldo + qty, custo: novoCusto });
  }

  // Atualizar no banco
  const detalhes: { id: string; codigo: string; descricao: string; custoAnterior: number | null; custoNovo: number }[] = [];
  let atualizados = 0;

  for (const [itemId, { custo: custoNovo }] of Array.from(acumulado.entries())) {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true, codigo: true, descricao: true, precoCusto: true },
    });
    if (!item) continue;

    await prisma.item.update({
      where: { id: itemId },
      data:  { precoCusto: custoNovo },
    });

    detalhes.push({
      id:            item.id,
      codigo:        item.codigo,
      descricao:     item.descricao,
      custoAnterior: item.precoCusto ? parseFloat(String(item.precoCusto)) : null,
      custoNovo,
    });
    atualizados++;
  }

  return NextResponse.json({ ok: true, atualizados, detalhes });
}
