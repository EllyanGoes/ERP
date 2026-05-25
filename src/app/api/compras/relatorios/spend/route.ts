export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from   = searchParams.get("from");
  const to     = searchParams.get("to");

  const dateFilter = (from || to) ? {
    createdAt: {
      ...(from ? { gte: new Date(from) }                : {}),
      ...(to   ? { lte: new Date(to + "T23:59:59.999Z") } : {}),
    },
  } : {};

  const pedidos = await prisma.pedidoCompra.findMany({
    where: {
      status: { notIn: ["RASCUNHO", "CANCELADO"] },
      ...dateFilter,
    },
    include: {
      fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      itens: {
        include: {
          item: {
            include: { tipoProduto: { select: { id: true, nome: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // ── Summary ──────────────────────────────────────────────────────────────────
  const totalSpend       = pedidos.reduce((s, p) => s + Number(p.valorTotal), 0);
  const totalFornecedores = new Set(pedidos.map((p) => p.fornecedorId)).size;

  // ── Spend por mês ─────────────────────────────────────────────────────────
  const byMonthMap = new Map<string, { valor: number; pedidos: number }>();
  for (const p of pedidos) {
    const key = p.createdAt.toISOString().slice(0, 7); // "2024-01"
    const prev = byMonthMap.get(key) ?? { valor: 0, pedidos: 0 };
    byMonthMap.set(key, { valor: prev.valor + Number(p.valorTotal), pedidos: prev.pedidos + 1 });
  }
  const byMonth = Array.from(byMonthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({ month, valor: d.valor, pedidos: d.pedidos }));

  // ── Spend por categoria (TipoProduto) ─────────────────────────────────────
  const byCatMap = new Map<string, number>();
  for (const p of pedidos) {
    for (const it of p.itens) {
      const cat = it.item.tipoProduto?.nome ?? "Sem Categoria";
      byCatMap.set(cat, (byCatMap.get(cat) ?? 0) + Number(it.valorTotal));
    }
  }
  // Fallback: if no item detail, attribute full order value to "Sem Categoria"
  if (byCatMap.size === 0) {
    for (const p of pedidos) {
      byCatMap.set("Sem Categoria", (byCatMap.get("Sem Categoria") ?? 0) + Number(p.valorTotal));
    }
  }
  const catTotal = Array.from(byCatMap.values()).reduce((s, v) => s + v, 0) || 1;
  const byCategoria = Array.from(byCatMap.entries())
    .map(([categoria, valor]) => ({ categoria, valor, pct: (valor / catTotal) * 100 }))
    .sort((a, b) => b.valor - a.valor);

  // ── Pareto por fornecedor ──────────────────────────────────────────────────
  const byFornMap = new Map<string, { nome: string; valor: number; pedidos: number }>();
  for (const p of pedidos) {
    const prev = byFornMap.get(p.fornecedorId) ?? {
      nome: p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial,
      valor: 0, pedidos: 0,
    };
    byFornMap.set(p.fornecedorId, {
      nome:    prev.nome,
      valor:   prev.valor + Number(p.valorTotal),
      pedidos: prev.pedidos + 1,
    });
  }
  const sorted = Array.from(byFornMap.entries())
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => b.valor - a.valor);

  let acc = 0;
  const byFornecedor = sorted.map((f) => {
    acc += f.valor;
    return {
      id:           f.id,
      nome:         f.nome,
      valor:        f.valor,
      pedidos:      f.pedidos,
      pct:          totalSpend > 0 ? (f.valor / totalSpend) * 100 : 0,
      pctAcumulado: totalSpend > 0 ? (acc    / totalSpend) * 100 : 0,
    };
  });

  return NextResponse.json({
    summary: {
      totalSpend,
      totalPedidos:    pedidos.length,
      totalFornecedores,
      ticketMedio:     pedidos.length > 0 ? totalSpend / pedidos.length : 0,
    },
    byMonth,
    byCategoria,
    byFornecedor,
  });
}
