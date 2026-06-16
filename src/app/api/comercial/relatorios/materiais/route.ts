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
//    comparar com o praticado no intervalo selecionado;
//  • Venda à ordem  → quantidade entregue ao cliente via venda triangular.
//
// Venda à ordem (triangular) gera 3 movimentos virtuais marcados com vendaOrdemId:
// SAÍDA na origem (transferência), ENTRADA virtual na empresa da venda e SAÍDA
// ao cliente. A entrada virtual e a entrega contam normalmente (entrou + saiu),
// mas a SAÍDA de transferência da origem é descartada para não duplicar a saída
// quando o relatório enxerga mais de uma empresa (escopo de grupo).
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

  const [movsAgg, vendasPeriodo, vendasGeral, vendaOrdemAgg] = await Promise.all([
    // Entradas/Saídas do estoque no período (quantidades). Descarta a perna de
    // transferência da venda à ordem (SAÍDA na origem, sem pedidoVendaItem).
    prisma.movimentacaoEstoque.groupBy({
      by: ["itemId", "tipo"],
      where: {
        createdAt: { gte: from, lte: to },
        NOT: { vendaOrdemId: { not: null }, tipo: "SAIDA", pedidoVendaItemId: null },
      },
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
    // Venda à ordem: quantidade entregue ao cliente (perna de SAÍDA com pedidoVendaItem).
    prisma.movimentacaoEstoque.groupBy({
      by: ["itemId"],
      where: { createdAt: { gte: from, lte: to }, vendaOrdemId: { not: null }, pedidoVendaItemId: { not: null }, tipo: "SAIDA" },
      _sum: { quantidade: true },
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
  const vendaOrdemMap = new Map(vendaOrdemAgg.map((v) => [v.itemId, decimalToNumber(v._sum?.quantidade)]));

  // Materiais com atividade no período (movimentação ou venda).
  const itemIds = new Set<string>();
  entrouMap.forEach((_, k) => itemIds.add(k));
  saiuMap.forEach((_, k) => itemIds.add(k));
  vendaPeriodoMap.forEach((_, k) => itemIds.add(k));
  vendaOrdemMap.forEach((_, k) => itemIds.add(k));

  // Relatório comercial: só produtos vendáveis.
  const itens = await prisma.item.findMany({
    where: { id: { in: Array.from(itemIds) }, vendavel: true },
    select: { id: true, codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } },
  });
  const itemInfo = new Map(itens.map((i) => [i.id, i]));

  const rows = Array.from(itemIds)
    .map((itemId) => {
      const info = itemInfo.get(itemId);
      if (!info) return null; // item não vendável → fora do relatório
      const vp = vendaPeriodoMap.get(itemId);
      const vg = vendaGeralMap.get(itemId);

      const qtdVendida = decimalToNumber(vp?._sum?.quantidade);
      const valorVendido = decimalToNumber(vp?._sum?.valorTotal);
      const qtdGeral = decimalToNumber(vg?._sum?.quantidade);
      const valorGeral = decimalToNumber(vg?._sum?.valorTotal);

      return {
        itemId,
        codigo: info.codigo,
        descricao: info.descricao,
        unidade: info.unidade?.sigla ?? info.unidadeMedida ?? "UN",
        entrouQtd: entrouMap.get(itemId) ?? 0,
        saiuQtd: saiuMap.get(itemId) ?? 0,
        vendaOrdemQtd: vendaOrdemMap.get(itemId) ?? 0,
        qtdVendida,
        valorVendido,
        precoMedioPeriodo: qtdVendida > 0 ? valorVendido / qtdVendida : 0,
        precoMedioGeral: qtdGeral > 0 ? valorGeral / qtdGeral : 0,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && (r.entrouQtd !== 0 || r.saiuQtd !== 0 || r.qtdVendida !== 0))
    .sort((a, b) => b.valorVendido - a.valorVendido || a.descricao.localeCompare(b.descricao, "pt-BR"));

  return NextResponse.json({
    rows,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  });
}
