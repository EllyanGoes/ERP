export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/suprimentos/cotacoes/verificar-itens?itemIds=id1,id2
// Returns cotações PENDENTE/EM_ANALISE that contain the given item IDs
export async function GET(req: NextRequest) {
  const itemIds = (req.nextUrl.searchParams.get("itemIds") ?? "")
    .split(",")
    .filter(Boolean);

  if (itemIds.length === 0) return NextResponse.json({ data: [] });

  const cotacoes = await prisma.cotacaoCompra.findMany({
    where: {
      status: { in: ["PENDENTE", "EM_ANALISE"] },
      fornecedores: {
        some: {
          itens: { some: { itemId: { in: itemIds } } },
        },
      },
    },
    select: {
      id: true,
      numero: true,
      nome: true,
      status: true,
      fornecedores: {
        select: {
          itens: {
            where: { itemId: { in: itemIds } },
            select: {
              itemId: true,
              item: { select: { codigo: true, descricao: true } },
            },
          },
        },
      },
    },
  });

  // Flatten to a map: itemId → list of cotação nums
  const itemCotacaoMap: Record<string, { cotacaoNumero: string; cotacaoNome: string | null }[]> = {};

  for (const ct of cotacoes) {
    for (const cf of ct.fornecedores) {
      for (const ci of cf.itens) {
        if (!itemCotacaoMap[ci.itemId]) itemCotacaoMap[ci.itemId] = [];
        const already = itemCotacaoMap[ci.itemId].find((x) => x.cotacaoNumero === ct.numero);
        if (!already) {
          itemCotacaoMap[ci.itemId].push({ cotacaoNumero: ct.numero, cotacaoNome: ct.nome });
        }
      }
    }
  }

  // Build warnings list
  const warnings: {
    itemId: string;
    codigo: string;
    descricao: string;
    cotacoes: string[];
  }[] = [];

  for (const ct of cotacoes) {
    for (const cf of ct.fornecedores) {
      for (const ci of cf.itens) {
        const exists = warnings.find((w) => w.itemId === ci.itemId);
        if (!exists) {
          warnings.push({
            itemId: ci.itemId,
            codigo: ci.item.codigo,
            descricao: ci.item.descricao,
            cotacoes: (itemCotacaoMap[ci.itemId] ?? []).map(
              (c) => c.cotacaoNome ? `${c.cotacaoNumero} (${c.cotacaoNome})` : c.cotacaoNumero
            ),
          });
        }
      }
    }
  }

  return NextResponse.json({ data: warnings });
}
