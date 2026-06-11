export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { custosPorEmpresaItem, chaveCustoEmpresa } from "@/lib/custo-empresa";
import { Prisma } from "@prisma/client";

/**
 * GET /api/suprimentos/relatorios/movimentacoes
 *
 * Query params:
 *   dataInicio  — ISO date string (inclusive, local midnight)
 *   dataFim     — ISO date string (inclusive, until 23:59:59)
 *   localId     — filter by localEstoqueId ("" = todos)
 *   tipo        — "ENTRADA" | "SAIDA" | "" = todos
 *
 * Returns: { rows: Row[], total: number }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const dataInicio = searchParams.get("dataInicio");
  const dataFim    = searchParams.get("dataFim");
  const localId    = searchParams.get("localId") ?? "";
  const tipo       = searchParams.get("tipo") ?? "";

  // Build where clause
  const where: Prisma.MovimentacaoEstoqueWhereInput = {};

  if (dataInicio || dataFim) {
    where.createdAt = {
      ...(dataInicio ? { gte: new Date(dataInicio + "T00:00:00.000Z") } : {}),
      ...(dataFim    ? { lte: new Date(dataFim    + "T23:59:59.999Z") } : {}),
    };
  }
  if (localId) where.localEstoqueId = localId;
  if (tipo === "ENTRADA" || tipo === "SAIDA") where.tipo = tipo;

  const movs = await prisma.movimentacaoEstoque.findMany({
    where,
    include: {
      item:        { select: { id: true, codigo: true, descricao: true, precoCusto: true } },
      localEstoque:{ select: { id: true, nome: true } },
      unidade:     { select: { id: true, sigla: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Aggregate by item
  type Row = {
    itemId: string;
    codigo: string;
    descricao: string;
    unidade: string;
    totalEntradaQtd: number;
    totalEntradaValor: number;
    totalSaidaQtd: number;
    totalSaidaValor: number;
    movimentacoes: number;
  };

  const map = new Map<string, Row>();

  // Custo por empresa: movimentações sem valor unitário usam o CMPM da
  // empresa da movimentação (fallback no CMPM global do Item).
  const custosEmp = await custosPorEmpresaItem(
    prisma,
    movs.filter((m) => m.valorUnitario == null).map((m) => ({ empresaId: m.empresaId, itemId: m.itemId })),
  );

  for (const m of movs) {
    const qty   = parseFloat(String(m.quantidade ?? 0));
    const custoEmp = custosEmp.get(chaveCustoEmpresa(m.empresaId, m.itemId));
    const custo = parseFloat(String(m.valorUnitario ?? custoEmp ?? m.item.precoCusto ?? 0));
    const valor = qty * custo;

    if (!map.has(m.itemId)) {
      map.set(m.itemId, {
        itemId:   m.itemId,
        codigo:   m.item.codigo,
        descricao: m.item.descricao,
        unidade:  m.unidade?.sigla ?? "—",
        totalEntradaQtd:   0,
        totalEntradaValor: 0,
        totalSaidaQtd:     0,
        totalSaidaValor:   0,
        movimentacoes: 0,
      });
    }

    const row = map.get(m.itemId)!;
    row.movimentacoes++;

    if (m.tipo === "ENTRADA") {
      row.totalEntradaQtd   += qty;
      row.totalEntradaValor += valor;
    } else if (m.tipo === "SAIDA") {
      row.totalSaidaQtd   += qty;
      row.totalSaidaValor += valor;
    }
  }

  const rows = Array.from(map.values()).sort((a, b) =>
    a.descricao.localeCompare(b.descricao, "pt-BR")
  );

  return NextResponse.json({ rows, total: movs.length });
}
