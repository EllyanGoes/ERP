import { prisma } from "@/lib/prisma";

export type PcMatch = {
  id: string;
  numero: string;
  status: string;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null };
  necessidadeNumero: string | null;
  cotacaoNumero: string | null;
  matchCount: number;
  totalItens: number;
  itens: Array<{
    id: string;
    quantidade: unknown;
    item: { id: string; codigo: string; descricao: string; unidadeMedida: string };
  }>;
};

// Encontra Pedidos de Compra "abertos" (ainda sem Documento de Entrada vinculado)
// do mesmo fornecedor que tenham ao menos um item em comum com os itens informados.
// Usado para sugerir vínculo ao criar um DE avulso e evitar duplicidade de registros.
export async function findMatchingPedidos(
  fornecedorId: string,
  itemIds: string[],
): Promise<PcMatch[]> {
  if (!fornecedorId) return [];
  const wantedIds = Array.from(new Set(itemIds.filter(Boolean)));
  if (wantedIds.length === 0) return [];

  const pedidos = await prisma.pedidoCompra.findMany({
    where: {
      fornecedorId,
      status: { not: "CANCELADO" },
      conferencia: { is: null },
      itens: { some: { itemId: { in: wantedIds } } },
    },
    select: {
      id: true,
      numero: true,
      status: true,
      fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      necessidade: { select: { numero: true } },
      cotacao: { select: { numero: true, necessidade: { select: { numero: true } } } },
      itens: {
        select: {
          id: true,
          quantidade: true,
          item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const wanted = new Set(wantedIds);

  return pedidos
    .map((p) => ({
      id: p.id,
      numero: p.numero,
      status: p.status,
      fornecedor: p.fornecedor,
      necessidadeNumero: p.necessidade?.numero ?? p.cotacao?.necessidade?.numero ?? null,
      cotacaoNumero: p.cotacao?.numero ?? null,
      matchCount: p.itens.filter((i) => wanted.has(i.item.id)).length,
      totalItens: p.itens.length,
      itens: p.itens.map((i) => ({
        id: i.id,
        quantidade: i.quantidade,
        item: i.item,
      })),
    }))
    .sort((a, b) => b.matchCount - a.matchCount);
}
