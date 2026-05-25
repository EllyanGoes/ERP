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
          ...(from ? { gte: new Date(from) }                    : {}),
          ...(to   ? { lte: new Date(to + "T23:59:59.999Z") }  : {}),
        },
      }
    : {};

  const pedidos = await prisma.pedidoCompra.findMany({
    where: {
      status:             { notIn: ["RASCUNHO", "CANCELADO"] },
      dataEntregaPrevista: { not: null },
      ...dateFilter,
    },
    include: {
      fornecedor:  { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      conferencia: { select: { id: true, createdAt: true } },
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

  // ── Classify each pedido ────────────────────────────────────────────────────
  type Classified = {
    id:                  string;
    fornecedorId:        string;
    fornecedorNome:      string;
    month:               string;
    categorias:          string[];
    atendido:            boolean;
    dataEntregaPrevista: Date;
  };

  const classified: Classified[] = pedidos.map((p) => {
    const prazo = p.dataEntregaPrevista as Date; // guaranteed not null by filter

    let atendido: boolean;
    if (p.status === "RECEBIDO") {
      if (!p.conferencia) {
        // No conferencia — assume OK
        atendido = true;
      } else {
        atendido = p.conferencia.createdAt <= prazo;
      }
    } else {
      // Not yet received
      atendido = prazo >= now; // still within window
    }

    const categorias = Array.from(
      new Set(
        p.itens
          .map((it) => it.item.tipoProduto?.nome ?? "Sem Categoria")
          .filter(Boolean)
      )
    );
    if (categorias.length === 0) categorias.push("Sem Categoria");

    return {
      id:                  p.id,
      fornecedorId:        p.fornecedorId,
      fornecedorNome:      p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial,
      month:               p.dataEntregaPrevista!.toISOString().slice(0, 7),
      categorias,
      atendido,
      dataEntregaPrevista: prazo,
    };
  });

  // ── Summary ─────────────────────────────────────────────────────────────────
  const total       = classified.length;
  const atendidos   = classified.filter((c) => c.atendido).length;
  const naoAtendidos = total - atendidos;
  const otdPct      = total > 0 ? (atendidos / total) * 100 : 0;

  // ── By Month ─────────────────────────────────────────────────────────────────
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
      pct:        d.atendido + d.naoAtendido > 0
        ? (d.atendido / (d.atendido + d.naoAtendido)) * 100
        : 0,
    }));

  // ── By Categoria ─────────────────────────────────────────────────────────────
  // Each pedido can count for multiple categories (one count per category)
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
      pct:         d.atendido + d.naoAtendido > 0
        ? (d.atendido / (d.atendido + d.naoAtendido)) * 100
        : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // ── By Fornecedor ─────────────────────────────────────────────────────────────
  const byFornMap = new Map<string, { nome: string; atendido: number; naoAtendido: number }>();
  for (const c of classified) {
    const prev = byFornMap.get(c.fornecedorId) ?? {
      nome: c.fornecedorNome,
      atendido: 0,
      naoAtendido: 0,
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
      pct:         d.atendido + d.naoAtendido > 0
        ? (d.atendido / (d.atendido + d.naoAtendido)) * 100
        : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    summary: { total, atendidos, naoAtendidos, otdPct },
    byMonth,
    byCategoria,
    byFornecedor,
  });
}
