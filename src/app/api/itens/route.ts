export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const tipo = searchParams.get("tipo") || undefined;
  const categoria = searchParams.get("categoria") || undefined;
  const estadoWip = searchParams.get("estadoWip") || undefined;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  const where = {
    AND: [
      q ? {
        OR: [
          { codigo: { contains: q, mode: "insensitive" as const } },
          { descricao: { contains: q, mode: "insensitive" as const } },
        ],
      } : {},
      tipo ? { tipo: tipo as any } : {},
      categoria
        ? (categoria.includes(",")
            ? { categoriaEstoque: { in: categoria.split(",").map((c) => c.trim()).filter(Boolean) as any } }
            : { categoriaEstoque: categoria as any })
        : {},
      estadoWip ? { estadosWip: { has: estadoWip } } : {},
    ],
  };

  const [data, total] = await Promise.all([
    prisma.item.findMany({
      where,
      include: {
        estoqueItems: { include: { localEstoque: true } },
        // Unidades alternativas (p/ escolher a unidade de compra e converter custo).
        unidade: { select: { sigla: true } },
        itemUnidades: { select: { unidadeId: true, fatorConversao: true, isPrincipal: true, unidade: { select: { sigla: true } } } },
      },
      orderBy: { codigo: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.item.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, limit });
}

// Criação legada (código manual, sem unidade/tipo/categoria) desativada:
// produto novo só por /api/suprimentos/produtos, que aplica as regras do cadastro.
export async function POST() {
  return NextResponse.json({ error: "Cadastre o produto em Suprimentos › Produtos." }, { status: 410 });
}
