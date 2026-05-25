export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to   = searchParams.get("to");

  const dateFilter = (from || to)
    ? {
        createdAt: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to   ? { lte: new Date(to + "T23:59:59.999Z") } : {}),
        },
      }
    : {};

  const pedidos = await prisma.pedidoCompra.findMany({
    where: {
      status:              { notIn: ["RASCUNHO", "CANCELADO"] },
      dataEntregaPrevista: { not: null },
      ...dateFilter,
    },
    include: {
      fornecedor:   { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      conferencia:  { select: { id: true, createdAt: true } },
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

  const now = new Date();

  // ── Classify each pedido ───────────────────────────────────────────────────
  type Classified = {
    id:                  string;
    atendido:            boolean;
    month:               string;
    categorias:          string[];
    fornecedorId:        string;
    fornecedorNome:      string;
    dataEntregaPrevista: Date;
  };

  const classified: Classified[] = pedidos.map((p) => {
    // dataEntregaPrevista is guaranteed not-null by the where clause
    const prazo = p.dataEntregaPrevista as Date;

    let atendido: boolean;

    if (p.status === "RECEBIDO") {
      if (!p.conferencia) {
        // No conferencia record — assume OK
        atendido = true;
      } else {
        atendido = p.conferencia.createdAt <= prazo;
      }
    } else {
      // Not received yet
      if (prazo < now) {
        // Overdue and not received
        atendido = false;
      } else {
        // Still within window
        atendido = true;
      }
    }

    const cats = p.itens.map((it) => it.item.tipoProduto?.nome ?? "Sem Categoria");
    const categorias = p.itens.length > 0
      ? Array.from(new Set(cats))
      : ["Sem Categoria"];

    return {
      id:                  p.id,
      atendido,
      month:               prazo.toISOString().slice(0, 7),
      categorias,
      fornecedorId:        p.fornecedorId,
      fornecedorNome:      p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial,
      dataEntregaPrevista: prazo,
    };
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  const total      = classified.length;
  const atendidos  = classified.filter((c) => c.atendido).length;
  const naoAtendidos = total - atendidos;
  const slaPct     = total > 0 ? (atendidos / total) * 100 : 0;

  // ── By Month ───────────────────────────────────────────────────────────────
  const byMonthMap = new Map<string, { atendido: number; naoAtendido: number }>();
  for (const c of classified) {
    const prev = byMonthMap.get(c.month) ?? { atendido: 0, naoAtendido: 0 };
    byMonthMap.set(c.month, {
      atendido:    prev.atendido    + (c.atendido ? 1 : 0),
      naoAtendido: prev.naoAtendido + (c.atendido ? 0 : 1),
    });
  }
  const byMonth = Array.from(byMonthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({
      month,
      atendido:   d.atendido,
      naoAtendido: d.naoAtendido,
      total:      d.atendido + d.naoAtendido,
      pct:        (d.atendido + d.naoAtendido) > 0
        ? (d.atendido / (d.atendido + d.naoAtendido)) * 100
        : 0,
    }));

  // ── By Categoria ───────────────────────────────────────────────────────────
  const byCatMap = new Map<string, { atendido: number; naoAtendido: number }>();
  for (const c of classified) {
    for (const cat of c.categorias) {
      const prev = byCatMap.get(cat) ?? { atendido: 0, naoAtendido: 0 };
      byCatMap.set(cat, {
        atendido:    prev.atendido    + (c.atendido ? 1 : 0),
        naoAtendido: prev.naoAtendido + (c.atendido ? 0 : 1),
      });
    }
  }
  const byCategoria = Array.from(byCatMap.entries())
    .map(([categoria, d]) => ({
      categoria,
      atendido:    d.atendido,
      naoAtendido: d.naoAtendido,
      total:       d.atendido + d.naoAtendido,
      pct:         (d.atendido + d.naoAtendido) > 0
        ? (d.atendido / (d.atendido + d.naoAtendido)) * 100
        : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // ── By Fornecedor (top 10) ─────────────────────────────────────────────────
  const byFornMap = new Map<string, { nome: string; atendido: number; naoAtendido: number }>();
  for (const c of classified) {
    const prev = byFornMap.get(c.fornecedorId) ?? {
      nome: c.fornecedorNome, atendido: 0, naoAtendido: 0,
    };
    byFornMap.set(c.fornecedorId, {
      nome:        prev.nome,
      atendido:    prev.atendido    + (c.atendido ? 1 : 0),
      naoAtendido: prev.naoAtendido + (c.atendido ? 0 : 1),
    });
  }
  const byFornecedor = Array.from(byFornMap.entries())
    .map(([id, d]) => ({
      id,
      nome:        d.nome,
      atendido:    d.atendido,
      naoAtendido: d.naoAtendido,
      total:       d.atendido + d.naoAtendido,
      pct:         (d.atendido + d.naoAtendido) > 0
        ? (d.atendido / (d.atendido + d.naoAtendido)) * 100
        : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return NextResponse.json({
    summary: { total, atendidos, naoAtendidos, slaPct },
    byMonth,
    byCategoria,
    byFornecedor,
  });
}
