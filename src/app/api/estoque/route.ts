export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  // ── 1. Explicit stock records (estoqueItem) ───────────────────────────────
  const estoques = await prisma.estoqueItem.findMany({
    include: {
      item: {
        select: { id: true, codigo: true, descricao: true, tipo: true, unidadeMedida: true, ativo: true, unidade: { select: { sigla: true } } },
      },
      localEstoque: { select: { id: true, nome: true } },
    },
    orderBy: [{ localEstoque: { nome: "asc" } }, { item: { codigo: "asc" } }],
  });

  // ── 2. Compute positions from movements for items NOT yet in estoqueItem ──
  // This covers movements registered before the estoqueItem sync was implemented.
  const existingKeys = new Set(
    estoques.map((e) => `${e.itemId}__${e.localEstoqueId ?? "null"}`)
  );

  const movements = await prisma.movimentacaoEstoque.findMany({
    include: {
      item: {
        select: { id: true, codigo: true, descricao: true, tipo: true, unidadeMedida: true, ativo: true, unidade: { select: { sigla: true } } },
      },
      localEstoque: { select: { id: true, nome: true } },
    },
  });

  // Aggregate by (itemId, localEstoqueId)
  const aggMap = new Map<
    string,
    {
      itemId: string;
      localEstoqueId: string | null;
      item: (typeof movements)[0]["item"];
      localEstoque: (typeof movements)[0]["localEstoque"];
      saldo: number;
    }
  >();

  for (const mov of movements) {
    const key = `${mov.itemId}__${mov.localEstoqueId ?? "null"}`;
    if (existingKeys.has(key)) continue; // already covered by estoqueItem

    const qty = parseFloat(String(mov.quantidade));
    const delta = mov.tipo === "ENTRADA" ? qty : -qty;

    if (!aggMap.has(key)) {
      aggMap.set(key, {
        itemId: mov.itemId,
        localEstoqueId: mov.localEstoqueId,
        item: mov.item,
        localEstoque: mov.localEstoque,
        saldo: 0,
      });
    }
    aggMap.get(key)!.saldo += delta;
  }

  // Convert aggregated movements into synthetic estoqueItem-shaped objects
  const synthetic = Array.from(aggMap.values())
    .filter((a) => a.saldo > 0) // only positive stock
    .map((a) => ({
      id: `mov__${a.itemId}__${a.localEstoqueId ?? "null"}`,
      itemId: a.itemId,
      quantidadeAtual: a.saldo,
      quantidadeMin: 0,
      quantidadeMax: null,
      localizacao: null,
      updatedAt: new Date(),
      localEstoqueId: a.localEstoqueId,
      item: a.item,
      localEstoque: a.localEstoque,
    }));

  const result = [...estoques, ...synthetic];

  return NextResponse.json({ data: result });
}
