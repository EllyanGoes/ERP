export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type PedidoDetail = {
  id: string;
  numero: string;
  fornecedorNome: string;
  valor: number;
  receiptDate: string;
};

export async function GET(req: NextRequest) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const from    = searchParams.get("from");
  const to      = searchParams.get("to");
  const groupBy = (searchParams.get("groupBy") ?? "month") as "month" | "day";

  // Fetch all entry documents (Documentos de Entrada / ConferenciaCompra) that are finalized.
  // O gasto é calculado SOBRE os documentos de entrada — não sobre os pedidos de compra
  // (muitos documentos não têm pedido vinculado e ficariam de fora).
  const docs = await prisma.conferenciaCompra.findMany({
    where: {
      status: { in: ["CONCLUIDA", "DIVERGENCIA"] },
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
    orderBy: { dataConferencia: "asc" },
  });

  // Data base = data da conferência (recebimento); fallbacks por segurança.
  const docDate = (c: (typeof docs)[number]): Date =>
    c.dataConferencia ?? c.dtEmissao ?? c.createdAt;

  // Valor do documento = soma dos itens (vlrTotal); fallback p/ total do cabeçalho.
  const docValor = (c: (typeof docs)[number]): number => {
    const somaItens = c.itens.reduce((s, it) => s + Number(it.vlrTotal ?? 0), 0);
    return somaItens > 0 ? somaItens : Number(c.vrTotal ?? 0);
  };

  const fornecedorId   = (c: (typeof docs)[number]): string => c.fornecedorId ?? "__sem__";
  const fornecedorNome = (c: (typeof docs)[number]): string =>
    c.fornecedor ? (c.fornecedor.nomeFantasia || c.fornecedor.razaoSocial) : "Sem fornecedor";

  // Post-filter by data base range
  // Use explicit Brazil timezone offset (UTC-3) so midnight BRT aligns correctly with UTC-stored dates
  const fromDate = from ? new Date(from + "T00:00:00-03:00") : null;
  const toDate   = to   ? new Date(to   + "T23:59:59-03:00") : null;

  const filtered = docs.filter((c) => {
    const d = docDate(c);
    if (fromDate && d < fromDate) return false;
    if (toDate   && d > toDate)   return false;
    return true;
  });

  // ── Summary ──────────────────────────────────────────────────────────────────
  const totalSpend        = filtered.reduce((s, c) => s + docValor(c), 0);
  const totalPedidos      = filtered.length;
  const totalFornecedores = new Set(filtered.map((c) => fornecedorId(c))).size;
  const ticketMedio       = totalPedidos > 0 ? totalSpend / totalPedidos : 0;

  // ── Spend por mês / dia (group by data base do documento) ──────────────────
  const byMonthMap = new Map<string, { valor: number; pedidos: number; pedidosList: PedidoDetail[] }>();
  for (const c of filtered) {
    const d = docDate(c);
    const key = groupBy === "day"
      ? d.toISOString().slice(0, 10) // "YYYY-MM-DD"
      : d.toISOString().slice(0, 7); // "YYYY-MM"
    const prev = byMonthMap.get(key) ?? { valor: 0, pedidos: 0, pedidosList: [] };
    prev.valor += docValor(c);
    prev.pedidos += 1;
    prev.pedidosList.push({
      id: c.id,
      numero: c.numero,
      fornecedorNome: fornecedorNome(c),
      valor: docValor(c),
      receiptDate: d.toISOString(),
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

  for (const c of filtered) {
    for (const it of c.itens) {
      const cat     = it.item.tipoProduto?.nome ?? "Sem Categoria";
      const itValor = Number(it.vlrTotal ?? 0);
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

  // Fallback: if no item details, attribute full document value to "Sem Categoria"
  if (byCatMap.size === 0) {
    for (const c of filtered) {
      const cat   = "Sem Categoria";
      const entry = byCatMap.get(cat) ?? { valor: 0, subItensMap: new Map() };
      entry.valor += docValor(c);
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

  for (const c of filtered) {
    const fid = fornecedorId(c);
    const prev = byFornMap.get(fid) ?? {
      nome: fornecedorNome(c),
      valor: 0,
      pedidos: 0,
      pedidosList: [],
    };
    prev.valor += docValor(c);
    prev.pedidos += 1;
    prev.pedidosList.push({
      id: c.id,
      numero: c.numero,
      fornecedorNome: fornecedorNome(c),
      valor: docValor(c),
      receiptDate: docDate(c).toISOString(),
    });
    byFornMap.set(fid, prev);
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
