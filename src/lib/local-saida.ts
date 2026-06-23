import type { Prisma, CategoriaEstoque } from "@prisma/client";

// Resolução automática do LOCAL de saída de cada item (vendas/minutas).
//
// Problema que isto resolve: a minuta/balcão guardava UM `localEstoqueId` e
// dava baixa de TODOS os itens nesse local. Itens cuja categoria não pertence
// àquele local (ex.: Tijolão=PRODUTO_ACABADO sendo baixado de "Mercadorias")
// ficavam com saldo negativo e a contabilidade creditava uma conta de estoque
// que nunca recebeu a entrada → saldo contábil negativo.
//
// Regra (alinhada com a trava de entrada em estoque-categoria.ts): cada item
// sai do local da empresa cujas `categoriasAceitas` batem com a sua
// `categoriaEstoque`, preferindo onde há saldo. Tiers de decisão:
//   1) EstoqueItem do item em local que aceita a categoria → maior saldo.
//   2) Qualquer LocalEstoque da empresa que aceite a categoria (a baixa cria a
//      linha de EstoqueItem se ainda não existir).
//   3) Qualquer EstoqueItem do item (maior saldo) — local sem trava de categoria.
//   4) Fallback informado (o local escolhido na minuta/balcão).

type TxLike = Pick<Prisma.TransactionClient, "item" | "estoqueItem" | "localEstoque">;

const aceitaCategoria = (
  categoriasAceitas: CategoriaEstoque[],
  categoria: CategoriaEstoque | null,
): boolean => categoriasAceitas.length === 0 || (!!categoria && categoriasAceitas.includes(categoria));

/**
 * Devolve um Map itemId → localEstoqueId resolvido automaticamente para a SAÍDA.
 * O valor pode ser o `fallbackLocalId` quando não há candidato melhor.
 */
export async function resolverLocaisSaida(
  tx: TxLike,
  empresaId: string,
  itemIds: string[],
  fallbackLocalId: string | null,
): Promise<Map<string, string | null>> {
  const ids = Array.from(new Set(itemIds));
  const resultado = new Map<string, string | null>();
  if (ids.length === 0) return resultado;

  const [itens, estoques, locaisEmpresa] = await Promise.all([
    tx.item.findMany({
      where: { id: { in: ids } },
      select: { id: true, categoriaEstoque: true },
    }),
    tx.estoqueItem.findMany({
      where: { empresaId, itemId: { in: ids }, clienteDonoId: null, localEstoqueId: { not: null } },
      select: {
        itemId: true,
        localEstoqueId: true,
        quantidadeAtual: true,
        localEstoque: { select: { categoriasAceitas: true } },
      },
    }),
    tx.localEstoque.findMany({
      where: { empresaId, ativo: true },
      select: { id: true, categoriasAceitas: true },
    }),
  ]);

  const categoriaPorItem = new Map(itens.map((i) => [i.id, i.categoriaEstoque]));
  const estoquesPorItem = new Map<string, typeof estoques>();
  for (const e of estoques) {
    const arr = estoquesPorItem.get(e.itemId) ?? [];
    arr.push(e);
    estoquesPorItem.set(e.itemId, arr);
  }
  const num = (d: unknown) => parseFloat(String(d ?? 0)) || 0;

  for (const itemId of ids) {
    const categoria = categoriaPorItem.get(itemId) ?? null;
    const candidatos = estoquesPorItem.get(itemId) ?? [];

    // 1) EstoqueItem em local que aceita a categoria → maior saldo.
    const naCategoria = candidatos
      .filter((c) => aceitaCategoria(c.localEstoque?.categoriasAceitas ?? [], categoria))
      .sort((a, b) => num(b.quantidadeAtual) - num(a.quantidadeAtual));
    if (naCategoria.length) {
      resultado.set(itemId, naCategoria[0].localEstoqueId);
      continue;
    }

    // 2) Local da empresa que aceita a categoria (mesmo sem EstoqueItem ainda).
    const localCategoria = categoria
      ? locaisEmpresa.find((l) => l.categoriasAceitas.includes(categoria))
      : undefined;
    if (localCategoria) {
      resultado.set(itemId, localCategoria.id);
      continue;
    }

    // 3) Qualquer EstoqueItem do item (maior saldo).
    const qualquer = candidatos.slice().sort((a, b) => num(b.quantidadeAtual) - num(a.quantidadeAtual));
    resultado.set(itemId, qualquer.length ? qualquer[0].localEstoqueId : fallbackLocalId);
  }

  return resultado;
}
