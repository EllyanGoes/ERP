export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { definirCustoEmpresa } from "@/lib/custo-empresa";

/**
 * POST /api/admin/recalcular-custo-medio
 *
 * Recalcula o Custo Médio Ponderado Móvel (CMPM) de todos os itens com base
 * no histórico de conferências de compra (vlrUnitario), em ordem cronológica.
 *
 * Só atualiza itens que têm ao menos uma conferência com vlrUnitario > 0.
 * Restrito a ADMIN.
 */
export async function POST() {
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
      empresaId:          true,
      quantidadeRecebida: true,
      vlrUnitario:        true,
      conferencia:        { select: { createdAt: true } },
    },
    orderBy: { conferencia: { createdAt: "asc" } },
  });

  if (itensConferencia.length === 0) {
    return NextResponse.json({ ok: true, atualizados: 0, detalhes: [] });
  }

  // Recalcular: replay sequencial por item (e por empresa+item,
  // para o custo próprio de cada empresa do grupo)
  const acumulado = new Map<string, { saldo: number; custo: number }>();
  const acumuladoEmpresa = new Map<string, { empresaId: string; itemId: string; saldo: number; custo: number }>();

  for (const ci of itensConferencia) {
    const vlr = parseFloat(String(ci.vlrUnitario));
    const qty  = parseFloat(String(ci.quantidadeRecebida));
    if (!vlr || !qty || vlr <= 0 || qty <= 0) continue;

    const prev    = acumulado.get(ci.itemId) ?? { saldo: 0, custo: 0 };
    const novoCusto = prev.saldo > 0
      ? (prev.saldo * prev.custo + qty * vlr) / (prev.saldo + qty)
      : vlr;

    acumulado.set(ci.itemId, { saldo: prev.saldo + qty, custo: novoCusto });

    const chaveEmp = `${ci.empresaId}|${ci.itemId}`;
    const prevEmp = acumuladoEmpresa.get(chaveEmp) ?? { empresaId: ci.empresaId, itemId: ci.itemId, saldo: 0, custo: 0 };
    const novoCustoEmp = prevEmp.saldo > 0
      ? (prevEmp.saldo * prevEmp.custo + qty * vlr) / (prevEmp.saldo + qty)
      : vlr;
    acumuladoEmpresa.set(chaveEmp, { ...prevEmp, saldo: prevEmp.saldo + qty, custo: novoCustoEmp });
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

  // Custo próprio por empresa (cadastro compartilhado, custo separado)
  for (const { empresaId, itemId, custo } of Array.from(acumuladoEmpresa.values())) {
    await definirCustoEmpresa(prisma, empresaId, itemId, custo);
  }

  return NextResponse.json({ ok: true, atualizados, detalhes });
}
