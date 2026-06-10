export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET /api/estoque/check?itemId=X&localEstoqueId=Y
 *  Returns current stock for a specific item/location pair.
 *  If no record exists, returns { exists: false, quantidadeAtual: 0 }.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const itemId        = searchParams.get("itemId");
  const localEstoqueId = searchParams.get("localEstoqueId") || null;
  const clienteDonoId  = searchParams.get("clienteDonoId") || null;

  if (!itemId) return NextResponse.json({ error: "itemId obrigatório" }, { status: 400 });

  const estoque = await prisma.estoqueItem.findFirst({
    where: { itemId, localEstoqueId, clienteDonoId },
  });

  return NextResponse.json({
    exists:           !!estoque,
    quantidadeAtual:  estoque ? parseFloat(estoque.quantidadeAtual.toString()) : 0,
    quantidadeMin:    estoque ? parseFloat(estoque.quantidadeMin.toString())   : 0,
  });
}
