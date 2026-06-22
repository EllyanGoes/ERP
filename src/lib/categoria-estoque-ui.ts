import type { CategoriaEstoque } from "@prisma/client";
import {
  PackageCheck, ShoppingCart, Factory, Mountain, Flame, Fuel,
  Box, Wrench, Recycle, Warehouse, MapPin, type LucideIcon,
} from "lucide-react";

// Constantes client-safe da categoria de estoque (sem imports de servidor).
// O helper de validação (estoque-categoria.ts) reexporta daqui.

export const CATEGORIA_ESTOQUE_VALUES = [
  "PRODUTO_ACABADO",
  "MERCADORIA",
  "WIP",
  "MATERIA_PRIMA",
  "INSUMO",
  "COMBUSTIVEL",
  "EMBALAGEM",
  "FERRAMENTAS",
  "RESIDUO_PRODUCAO",
  "ALMOXARIFADO",
] as const satisfies readonly CategoriaEstoque[];

export const CATEGORIA_ESTOQUE_LABELS: Record<CategoriaEstoque, string> = {
  PRODUTO_ACABADO: "Produto acabado",
  MERCADORIA: "Mercadoria (revenda)",
  WIP: "Produtos em processo (WIP)",
  MATERIA_PRIMA: "Matéria-prima",
  INSUMO: "Insumos para queima",
  COMBUSTIVEL: "Combustível",
  EMBALAGEM: "Embalagem",
  FERRAMENTAS: "Ferramentas",
  RESIDUO_PRODUCAO: "Resíduos de produção",
  ALMOXARIFADO: "Almoxarifado",
};

// Descrição curta de cada categoria — usada em ajudas de UI.
export const CATEGORIA_ESTOQUE_DESCRICOES: Record<CategoriaEstoque, string> = {
  PRODUTO_ACABADO: "Produtos de origem de fabricação",
  MERCADORIA: "Produtos de compra (revenda)",
  WIP: "Produtos em processo",
  MATERIA_PRIMA: "Matéria-prima de fabricação (ex.: argila)",
  INSUMO: "Insumos consumidos na queima",
  COMBUSTIVEL: "Combustíveis (lenha, biomassa, óleo, gás…)",
  EMBALAGEM: "Pallets, fitas, filmes e materiais de embalagem",
  FERRAMENTAS: "Ferramentas requisitadas e devolvidas ao almoxarifado",
  RESIDUO_PRODUCAO: "Resíduos e sobras do processo produtivo (ex.: caco)",
  ALMOXARIFADO: "Diversos (exceto as demais categorias)",
};

export function rotuloCategoria(c: CategoriaEstoque | null | undefined): string {
  return c ? CATEGORIA_ESTOQUE_LABELS[c] : "Não classificado";
}

// Ícone (lucide) representativo de cada categoria — usado em listas/badges.
export const CATEGORIA_ESTOQUE_ICONS: Record<CategoriaEstoque, LucideIcon> = {
  PRODUTO_ACABADO: PackageCheck,
  MERCADORIA: ShoppingCart,
  WIP: Factory,
  MATERIA_PRIMA: Mountain,
  INSUMO: Flame,
  COMBUSTIVEL: Fuel,
  EMBALAGEM: Box,
  FERRAMENTAS: Wrench,
  RESIDUO_PRODUCAO: Recycle,
  ALMOXARIFADO: Warehouse,
};

// Cor (classe Tailwind) por categoria — combina com o ícone.
export const CATEGORIA_ESTOQUE_CORES: Record<CategoriaEstoque, string> = {
  PRODUTO_ACABADO: "text-emerald-500",
  MERCADORIA: "text-blue-500",
  WIP: "text-cyan-500",
  MATERIA_PRIMA: "text-amber-600",
  INSUMO: "text-orange-500",
  COMBUSTIVEL: "text-red-500",
  EMBALAGEM: "text-violet-500",
  FERRAMENTAS: "text-slate-500",
  RESIDUO_PRODUCAO: "text-lime-600",
  ALMOXARIFADO: "text-gray-500",
};

// Ícone/cor de um local conforme sua categoria principal (1ª aceita).
export function iconeLocalPorCategoria(cats: CategoriaEstoque[] | null | undefined): { Icon: LucideIcon; cor: string } {
  const c = cats && cats.length > 0 ? cats[0] : null;
  return c
    ? { Icon: CATEGORIA_ESTOQUE_ICONS[c], cor: CATEGORIA_ESTOQUE_CORES[c] }
    : { Icon: MapPin, cor: "text-emerald-500" };
}
