export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return isNaN(d.getTime()) ? fallback : d;
}

// GET /api/comercial/relatorios/materiais?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Relatório de materiais (foco comercial). Por material, no período:
//  • Entrou / Saiu  → quantidades das movimentações de estoque (ENTRADA/SAIDA);
//  • Vendas         → quantidade e valor vendidos (itens de pedidos não
//    cancelados/orçamento, pela data de emissão) → preço médio de venda;
//  • Preço médio geral → preço médio de venda histórico (todo o período), para
//    comparar com o praticado no intervalo selecionado.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const hoje = new Date();
  const defaultTo = hoje;
  const defaultFrom = new Date(hoje);
  defaultFrom.setDate(defaultFrom.getDate() - 29); // últimos 30 dias

  const from = parseDate(searchParams.get("from"), defaultFrom);
  const to = parseDate(searchParams.get("to"), defaultTo);
  // Janela ancorada em UTC (datas de negócio gravadas em meia-noite UTC).
  from.setUTCHours(0, 0, 0, 0);
  to.setUTCHours(23, 59, 59, 999);

  const [movsAgg, vendasPeriodo, vendasGeral] = await Promise.all([
    // Entradas/Saídas do estoque no período (quantidades)
    prisma.movimentacaoEstoque.groupBy({
      by: ["itemId", "tipo"],
      where: { createdAt: { gte: from, lte: to } },
      _sum: { quantidade: true },
    }),
    // Vendas no período (qtd + valor) — por data de emissão
    prisma.pedidoVendaItem.groupBy({
      by: ["itemId"],
      where: { pedidoVenda: { status: { notIn: ["ORCAMENTO", "CANCELADO"] }, dataEmissao: { gte: from, lte: to } } },
      _sum: { quantidade: true, valorTotal: true },
    }),
    // Vendas de todo o histórico (para o preço médio geral)
    prisma.pedidoVendaItem.groupBy({
      by: ["itemId"],
      where: { pedidoVenda: { status: { notIn: ["ORCAMENTO", "CANCELADO"] } } },
      _sum: { quantidade: true, valorTotal: true },
    }),
  ]);

  const entrouMap = new Map<string, number>();
  const saiuMap = new Map<string, number>();
  for (const m of movsAgg) {
    const q = decimalToNumber(m._sum.quantidade);
    if (m.tipo === "ENTRADA") entrouMap.set(m.itemId, (entrouMap.get(m.itemId) ?? 0) + q);
    else if (m.tipo === "SAIDA") saiuMap.set(m.itemId, (saiuMap.get(m.itemId) ?? 0) + q);
  }

  const vendaPeriodoMap = new Map(vendasPeriodo.map((v) => [v.itemId, v]));
  const vendaGeralMap = new Map(vendasGeral.map((v) => [v.itemId, v]));

  // Materiais com atividade no período (movimentação ou venda).
  const itemIds = new Set<string>();
  entrouMap.forEach((_, k) => itemIds.add(k));
  saiuMap.forEach((_, k) => itemIds.add(k));
  vendaPeriodoMap.forEach((_, k) => itemIds.add(k));

  const itens = await prisma.item.findMany({
    where: { id: { in: Array.from(itemIds) } },
    select: { id: true, codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } },
  });
  const itemInfo = new Map(itens.map((i) => [i.id, i]));

  const rows = Array.from(itemIds)
    .map((itemId) => {
      const info = itemInfo.get(itemId);
      const vp = vendaPeriodoMap.get(itemId);
      const vg = vendaGeralMap.get(itemId);

      const qtdVendida = decimalToNumber(vp?._sum?.quantidade);
      const valorVendido = decimalToNumber(vp?._sum?.valorTotal);
      const qtdGeral = decimalToNumber(vg?._sum?.quantidade);
      const valorGeral = decimalToNumber(vg?._sum?.valorTotal);

      return {
        itemId,
        codigo: info?.codigo ?? "—",
        descricao: info?.descricao ?? "—",
        unidade: info?.unidade?.sigla ?? info?.unidadeMedida ?? "UN",
        entrouQtd: entrouMap.get(itemId) ?? 0,
        saiuQtd: saiuMap.get(itemId) ?? 0,
        qtdVendida,
        valorVendido,
        precoMedioPeriodo: qtdVendida > 0 ? valorVendido / qtdVendida : 0,
        precoMedioGeral: qtdGeral > 0 ? valorGeral / qtdGeral : 0,
      };
    })
    .filter((r) => r.entrouQtd !== 0 || r.saiuQtd !== 0 || r.qtdVendida !== 0)
    .sort((a, b) => b.valorVendido - a.valorVendido || a.descricao.localeCompare(b.descricao, "pt-BR"));

  return NextResponse.json({
    rows,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  });
}
