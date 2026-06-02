export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { findMatchingPedidos } from "@/lib/pc-match";

// GET ?fornecedorId=...&itemIds=a,b,c
// Sugere Pedidos de Compra abertos compatíveis (mesmo fornecedor + itens em comum).
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

  const matches = await findMatchingPedidos(fornecedorId, itemIds);
  return NextResponse.json({ matches });
}
