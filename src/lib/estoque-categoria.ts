import { NextResponse } from "next/server";
import type { Prisma, CategoriaEstoque } from "@prisma/client";
import { CATEGORIA_ESTOQUE_LABELS, rotuloCategoria } from "@/lib/categoria-estoque-ui";

// Trava de categoria do local de estoque. Cada local pode declarar quais
// categorias de produto aceita (LocalEstoque.categoriasAceitas). Quando a lista
// está VAZIA, o local aceita qualquer produto (comportamento legado). Quando
// preenchida, só pode RECEBER (entrada) produtos cuja `categoriaEstoque` esteja
// na lista — impedindo, p.ex., cadastrar/movimentar o Tijolão (PRODUTO_ACABADO)
// no Almoxarifado.
//
// A regra é aplicada apenas na ENTRADA de estoque em um local (incluindo o
// destino de transferências e o recebimento de compras). Saídas NÃO são
// bloqueadas — é preciso poder retirar/corrigir estoque já mal alocado.
//
// Rótulos e valores ficam em categoria-estoque-ui.ts (client-safe).

export { CATEGORIA_ESTOQUE_LABELS, rotuloCategoria } from "@/lib/categoria-estoque-ui";

export type CategoriaInvalida = {
  itemId: string;
  itemDescricao?: string | null;
  localNome: string;
  categoriaItem: CategoriaEstoque | null;
  categoriasAceitas: CategoriaEstoque[];
};

export class CategoriaLocalInvalidaError extends Error {
  readonly itens: CategoriaInvalida[];
  constructor(itens: CategoriaInvalida[]) {
    super("CATEGORIA_LOCAL_INVALIDA");
    this.name = "CategoriaLocalInvalidaError";
    this.itens = itens;
  }
}

type TxLike = Pick<Prisma.TransactionClient, "item" | "localEstoque">;

/**
 * Valida que cada par (item → local) é compatível com as categorias aceitas do
 * local. Pares sem `localEstoqueId` são ignorados (estoque sem local não tem
 * restrição). Lança `CategoriaLocalInvalidaError` se algum par for incompatível.
 *
 * Deve ser chamado nos fluxos de ENTRADA, antes de gravar a movimentação.
 */
export async function assertItensPermitidosNosLocais(
  tx: TxLike,
  pares: Array<{ itemId: string; localEstoqueId: string | null | undefined }>,
): Promise<void> {
  const comLocal = pares.filter(
    (p): p is { itemId: string; localEstoqueId: string } => !!p.localEstoqueId,
  );
  if (comLocal.length === 0) return;

  const itemIds = Array.from(new Set(comLocal.map((p) => p.itemId)));
  const localIds = Array.from(new Set(comLocal.map((p) => p.localEstoqueId)));

  const [itens, locais] = await Promise.all([
    tx.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, descricao: true, categoriaEstoque: true },
    }),
    tx.localEstoque.findMany({
      where: { id: { in: localIds } },
      select: { id: true, nome: true, categoriasAceitas: true },
    }),
  ]);

  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const localPorId = new Map(locais.map((l) => [l.id, l]));

  const invalidos: CategoriaInvalida[] = [];
  // Deduplica por par para não repetir o mesmo erro em lotes com linhas iguais.
  const vistos = new Set<string>();

  for (const { itemId, localEstoqueId } of comLocal) {
    const chave = `${itemId}|${localEstoqueId}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    const local = localPorId.get(localEstoqueId);
    // Local sem categorias configuradas aceita qualquer produto.
    if (!local || local.categoriasAceitas.length === 0) continue;

    const item = itemPorId.get(itemId);
    const categoriaItem = item?.categoriaEstoque ?? null;
    if (categoriaItem && local.categoriasAceitas.includes(categoriaItem)) continue;

    invalidos.push({
      itemId,
      itemDescricao: item?.descricao,
      localNome: local.nome,
      categoriaItem,
      categoriasAceitas: local.categoriasAceitas,
    });
  }

  if (invalidos.length > 0) throw new CategoriaLocalInvalidaError(invalidos);
}

/** Resposta HTTP 422 padrão para CategoriaLocalInvalidaError. */
export function respostaCategoriaInvalida(err: CategoriaLocalInvalidaError): NextResponse {
  const primeiro = err.itens[0];
  const nome = primeiro.itemDescricao ?? primeiro.itemId;
  const aceitas = primeiro.categoriasAceitas.map((c) => CATEGORIA_ESTOQUE_LABELS[c]).join(", ");
  const detalhe =
    err.itens.length === 1
      ? `O produto "${nome}" (${rotuloCategoria(primeiro.categoriaItem)}) não pode entrar no local "${primeiro.localNome}", que aceita: ${aceitas}.`
      : `${err.itens.length} produtos têm categoria incompatível com o local de destino. Ex.: "${nome}" no local "${primeiro.localNome}".`;
  return NextResponse.json(
    {
      error: detalhe,
      codigo: "CATEGORIA_LOCAL_INVALIDA",
      invalidos: err.itens,
    },
    { status: 422 },
  );
}
