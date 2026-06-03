import { prisma } from "@/lib/prisma";

export type CotacaoMatch = {
  id: string;
  numero: string;
  nome: string | null;
  status: string;
  necessidadeNumero: string | null;
  matchCount: number;
  totalItens: number;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null };
  itens: Array<{
    id: string;
    quantidade: unknown;
    item: { id: string; codigo: string; descricao: string; unidadeMedida: string };
  }>;
};

// Encontra Cotações "abertas" (não CONCLUÍDAS) em que o fornecedor informado tem
// uma proposta com ao menos um item em comum com os itens informados. Usado para
// sugerir vínculo ao criar um Pedido de Compra avulso e evitar duplicar o fluxo
// de compra (a Cotação geraria seu próprio PC ao ser aprovada).
export async function findMatchingCotacoes(
  fornecedorId: string,
  itemIds: string[],
): Promise<CotacaoMatch[]> {
  if (!fornecedorId) return [];
  const wantedIds = Array.from(new Set(itemIds.filter(Boolean)));
  if (wantedIds.length === 0) return [];

  const cotacoes = await prisma.cotacaoCompra.findMany({
    where: {
      status: { not: "CONCLUIDA" },
      fornecedores: {
        some: {
          fornecedorId,
          itens: { some: { itemId: { in: wantedIds } } },
        },
      },
    },
    select: {
      id: true,
      numero: true,
      nome: true,
      status: true,
      necessidade: { select: { numero: true } },
      // Apenas a proposta do fornecedor pedido (filtro no where da relação).
      fornecedores: {
        where: { fornecedorId },
        select: {
          fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
          itens: {
            select: {
              id: true,
              quantidade: true,
              item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const wanted = new Set(wantedIds);

  return cotacoes
    .map((c) => {
      const cf = c.fornecedores[0];
      const itens = cf?.itens ?? [];
      return {
        id: c.id,
        numero: c.numero,
        nome: c.nome,
        status: c.status,
        necessidadeNumero: c.necessidade?.numero ?? null,
        fornecedor: cf?.fornecedor ?? { id: fornecedorId, razaoSocial: "", nomeFantasia: null },
        matchCount: itens.filter((i) => wanted.has(i.item.id)).length,
        totalItens: itens.length,
        itens: itens.map((i) => ({ id: i.id, quantidade: i.quantidade, item: i.item })),
      };
    })
    .filter((c) => c.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount);
}
