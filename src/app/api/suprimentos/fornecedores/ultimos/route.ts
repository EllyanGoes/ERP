export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/suprimentos/fornecedores/ultimos?itemIds=id1,id2
// Returns fornecedores that have participated in cotações containing the given items,
// ordered by most recently used. Falls back to all fornecedores from any cotação.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const itemIds = (searchParams.get("itemIds") ?? "").split(",").filter(Boolean);

  // Find cotação fornecedores that had these items
  const rows = await prisma.cotacaoFornecedor.findMany({
    where: itemIds.length > 0
      ? { itens: { some: { itemId: { in: itemIds } } } }
      : {},
    include: {
      fornecedor: {
        select: {
          id: true, razaoSocial: true, nomeFantasia: true,
          cpfCnpj: true, email: true, telefone: true, ativo: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Deduplicate by fornecedorId, keep most recent
  const seen = new Set<string>();
  const fornecedores = rows
    .map((r) => r.fornecedor)
    .filter((f) => {
      if (!f.ativo || seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });

  return NextResponse.json({ data: fornecedores });
}
