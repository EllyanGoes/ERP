export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type PedidoDetail = {
  id: string;
  numero: string;
  fornecedorNome: string;
  valor: number;
  receiptDate: string;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from    = searchParams.get("from");
  const to      = searchParams.get("to");
  const groupBy = (searchParams.get("groupBy") ?? "month") as "month" | "day";

  // Fetch all received orders that have a conferencia
  const pedidos = await prisma.pedidoCompra.findMany({
    where: {
      status: "RECEBIDO",
      conferencia: { isNot: null },
    },
    include: {
      fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      conferencia: { select: { id: true, numero: true, createdAt: true } },
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

  // Post-filter by conferencia.createdAt date range
  // Use explicit Brazil timezone offset (UTC-3) so midnight BRT aligns correctly with UTC-stored dates
  const fromDate = from ? new Date(from + "T00:00:00-03:00") : null;
  const toDate   = to   ? new Date(to   + "T23:59:59-03:00") : null;

  const filtered = pedidos.filter((p) => {
    if (!p.conferencia) return false;
    const d = p.conferencia.createdAt;
    if (fromDate && d < fromDate) return false;
    if (toDate   && d > toDate)   return false;
    return true;
  });

  // ── Summary ──────────────────────────────────────────────────────────────────
  const totalSpend        = filtered.reduce((s, p) => s + Number(p.valorTotal), 0);
  const totalPedidos      = filtered.length;
  const totalFornecedores = new Set(filtered.map((p) => p.fornecedorId)).size;
  const ticketMedio       = totalPedidos > 0 ? totalSpend / totalPedidos : 0;

  // ── Spend por mês / dia (group by conferencia date) ──────────────────────
  const byMonthMap = new Map<string, { valor: number; pedidos: number; pedidosList: PedidoDetail[] }>();
  for (const p of filtered) {
    const key = groupBy === "day"
      ? p.conferencia!.createdAt.toISOString().slice(0, 10) // "YYYY-MM-DD"
      : p.conferencia!.createdAt.toISOString().slice(0, 7); // "YYYY-MM"
    const prev = byMonthMap.get(key) ?? { valor: 0, pedidos: 0, pedidosList: [] };
    prev.valor += Number(p.valorTotal);
    prev.pedidos += 1;
    prev.pedidosList.push({
      id: p.id,
      numero: p.numero,
      fornecedorNome: p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial,
      valor: Number(p.valorTotal),
      receiptDate: p.conferencia!.createdAt.toISOString(),
    });
    byMonthMap.set(key, prev);
  }
  const byMonth = Array.from(byMonthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({ month, valor: d.valor, pedidos: d.pedidos, pedidosList: d.pedidosList }));

  // ── Spend por categoria (TipoProduto) with sub-item drill-down ────────────
  type CatEntry = {
    valor: number;
    subItensMap: Map<string, { nome: string; codigo: string; valor: number }>;
  };
  const byCatMap = new Map<string, CatEntry>();

  for (const p of filtered) {
    for (const it of p.itens) {
      const cat     = it.item.tipoProduto?.nome ?? "Sem Categoria";
      const itValor = Number(it.valorTotal);
      const entry   = byCatMap.get(cat) ?? { valor: 0, subItensMap: new Map() };

      entry.valor += itValor;

      const itemKey = it.item.id;
      const prev    = entry.subItensMap.get(itemKey);
      if (prev) {
        prev.valor += itValor;
      } else {
        entry.subItensMap.set(itemKey, {
          nome:   it.item.descricao,
          codigo: it.item.codigo ?? "",
          valor:  itValor,
        });
      }

      byCatMap.set(cat, entry);
    }
  }

  // Fallback: if no item details, attribute full order value to "Sem Categoria"
  if (byCatMap.size === 0) {
    for (const p of filtered) {
      const cat   = "Sem Categoria";
      const entry = byCatMap.get(cat) ?? { valor: 0, subItensMap: new Map() };
      entry.valor += Number(p.valorTotal);
      byCatMap.set(cat, entry);
    }
  }

  const catTotal = Array.from(byCatMap.values()).reduce((s, e) => s + e.valor, 0) || 1;

  const byCategoria = Array.from(byCatMap.entries())
    .map(([categoria, entry]) => ({
      categoria,
      valor: entry.valor,
      pct:   (entry.valor / catTotal) * 100,
      subItens: Array.from(entry.subItensMap.values()).sort((a, b) => b.valor - a.valor),
    }))
    .sort((a, b) => b.valor - a.valor);

  // ── Pareto por fornecedor ──────────────────────────────────────────────────
  const byFornMap = new Map<
    string,
    { nome: string; valor: number; pedidos: number; pedidosList: PedidoDetail[] }
  >();

  for (const p of filtered) {
    const prev = byFornMap.get(p.fornecedorId) ?? {
      nome: p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial,
      valor: 0,
      pedidos: 0,
      pedidosList: [],
    };
    prev.valor += Number(p.valorTotal);
    prev.pedidos += 1;
    prev.pedidosList.push({
      id: p.id,
      numero: p.numero,
      fornecedorNome: p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial,
      valor: Number(p.valorTotal),
      receiptDate: p.conferencia!.createdAt.toISOString(),
    });
    byFornMap.set(p.fornecedorId, prev);
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
      pedidosList:  f.pedidosList,
    };
  });

  return NextResponse.json({
    summary: { totalSpend, totalPedidos, totalFornecedores, ticketMedio },
    byMonth,
    byCategoria,
    byFornecedor,
  });
}
