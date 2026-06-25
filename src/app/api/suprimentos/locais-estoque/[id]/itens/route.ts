export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { id: string } };

// GET — itens PRÓPRIOS cadastrados no local, com o saldo atual (inclusive saldo
// zero/negativo). A requisição lista todos eles e avisa quando o saldo está
// zerado (não dá pra lançar saída). Exclui mercadoria de terceiro (clienteDonoId).
export async function GET(_req: NextRequest, { params }: Ctx) {
  const estoques = await prisma.estoqueItem.findMany({
    where: { localEstoqueId: params.id, clienteDonoId: null },
    select: { itemId: true, quantidadeAtual: true },
  });
  // Soma por item (pode haver registros por endereço dentro do mesmo local).
  const saldoPorItem = new Map<string, number>();
  for (const e of estoques) {
    saldoPorItem.set(e.itemId, (saldoPorItem.get(e.itemId) ?? 0) + Number(e.quantidadeAtual));
  }
  const itens = Array.from(saldoPorItem.entries()).map(([itemId, saldo]) => ({ itemId, saldo }));
  return NextResponse.json({ itens });
}
