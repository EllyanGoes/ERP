export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/suprimentos/fornecedor-vinculos-check
 *
 * Verifica quais combinações item × fornecedor ainda não existem em ProdutoFornecedor.
 * Usado para exibir o popup de "novo vínculo" antes de salvar pedido / concluir conferência.
 *
 * Query params:
 *   fornecedorId  – id do fornecedor
 *   itemIds       – ids de itens separados por vírgula
 *
 * Response:
 *   { novos: { id, codigo, descricao }[] }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fornecedorId = searchParams.get("fornecedorId");
  const itemIdsStr   = searchParams.get("itemIds");

  if (!fornecedorId || !itemIdsStr) {
    return NextResponse.json({ novos: [] });
  }

  const itemIds = itemIdsStr.split(",").filter(Boolean);
  if (itemIds.length === 0) return NextResponse.json({ novos: [] });

  // Relacionamentos já existentes
  const existing = await prisma.produtoFornecedor.findMany({
    where: { fornecedorId, itemId: { in: itemIds } },
    select: { itemId: true },
  });
  const existingSet = new Set(existing.map((e) => e.itemId));
  const novosIds    = itemIds.filter((id) => !existingSet.has(id));

  if (novosIds.length === 0) return NextResponse.json({ novos: [] });

  const items = await prisma.item.findMany({
    where: { id: { in: novosIds } },
    select: { id: true, codigo: true, descricao: true },
    orderBy: { codigo: "asc" },
  });

  return NextResponse.json({ novos: items });
}
