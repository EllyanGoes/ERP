import type { CategoriaEstoque } from "@prisma/client";

// Constantes client-safe da categoria de estoque (sem imports de servidor).
// O helper de validação (estoque-categoria.ts) reexporta daqui.

export const CATEGORIA_ESTOQUE_VALUES = [
  "PRODUTO_ACABADO",
  "MERCADORIA",
  "WIP",
  "INSUMO",
  "EMBALAGEM",
  "ALMOXARIFADO",
] as const satisfies readonly CategoriaEstoque[];

export const CATEGORIA_ESTOQUE_LABELS: Record<CategoriaEstoque, string> = {
  PRODUTO_ACABADO: "Produto acabado",
  MERCADORIA: "Mercadoria (revenda)",
  WIP: "Produtos em processo (WIP)",
  INSUMO: "Insumo / Matéria-prima",
  EMBALAGEM: "Embalagem",
  ALMOXARIFADO: "Almoxarifado",
};

// Descrição curta de cada categoria — usada em ajudas de UI.
export const CATEGORIA_ESTOQUE_DESCRICOES: Record<CategoriaEstoque, string> = {
  PRODUTO_ACABADO: "Produtos de origem de fabricação",
  MERCADORIA: "Produtos de compra (revenda)",
  WIP: "Produtos em processo",
  INSUMO: "Matéria-prima e insumos para queima",
  EMBALAGEM: "Pallets, fitas, filmes e materiais de embalagem",
  ALMOXARIFADO: "Diversos (exceto as demais categorias)",
};

export function rotuloCategoria(c: CategoriaEstoque | null | undefined): string {
  return c ? CATEGORIA_ESTOQUE_LABELS[c] : "Não classificado";
}
