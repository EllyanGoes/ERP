export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { id: string } };

// GET — itemIds com saldo PRÓPRIO positivo no local (para a requisição só listar
// produtos que realmente existem no almoxarifado escolhido). Exclui mercadoria de
// terceiro (clienteDonoId) — essa não é requisitável.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const estoques = await prisma.estoqueItem.findMany({
    where: { localEstoqueId: params.id, clienteDonoId: null, quantidadeAtual: { gt: 0 } },
    select: { itemId: true },
  });
  const itemIds = Array.from(new Set(estoques.map((e) => e.itemId)));
  return NextResponse.json({ itemIds });
}
