export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { itemSchema } from "@/lib/validations/item";
import { generateDocNumber } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const tipo = searchParams.get("tipo") || undefined;
  const categoria = searchParams.get("categoria") || undefined;
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

export async function POST(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = itemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { quantidadeMin, quantidadeMax, localizacao, ...itemData } = parsed.data;

  const item = await prisma.$transaction(async (tx) => {
    const newItem = await tx.item.create({ data: itemData });
    if (newItem.tipo !== "SERVICO") {
      await tx.estoqueItem.create({
        data: {
          itemId: newItem.id,
          clienteDonoId: null,
          quantidadeAtual: 0,
          quantidadeMin: quantidadeMin ?? 0,
          quantidadeMax: quantidadeMax ?? null,
          localizacao: localizacao ?? null,
        },
      });
    }
    return newItem;
  });

  return NextResponse.json({ data: item }, { status: 201 });
}
