export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { findMatchingCotacoes } from "@/lib/cotacao-match";

// GET ?fornecedorId=...&itemIds=a,b,c
// Sugere Cotações abertas compatíveis (mesmo fornecedor com proposta + itens em
// comum). Usado para avisar sobre duplicidade ao criar um Pedido de Compra avulso.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fornecedorId = (searchParams.get("fornecedorId") || "").trim();
  const itemIdsRaw = (searchParams.get("itemIds") || "").trim();
  const itemIds = itemIdsRaw
    ? itemIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  if (!fornecedorId || itemIds.length === 0) {
    return NextResponse.json({ matches: [] });
  }

  const matches = await findMatchingCotacoes(fornecedorId, itemIds);
  return NextResponse.json({ matches });
}
