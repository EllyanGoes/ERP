// Tipos compartilhados do editor de fluxo de produção (PCP).
// O grafo é a fonte de verdade (salvo em FluxoProducaoVersao.grafo como JSONB);
// estes tipos descrevem o shape de {nodes, edges} do React Flow + a config por nó.

import type { EstadoWIP } from "@prisma/client";

export type NodeKind =
  | "ESTOQUE_INSUMO" // estoque de MP / insumo (caroço de açaí, caco, água, pallets, fita PET)
  | "OPERACAO"       // etapa produtiva em um centro de trabalho
  | "TRANSPORTE"     // movimentação por vagoneta/vagão
  | "BUFFER_WIP"     // pulmão de WIP (úmido/seco/queimado)
  | "INSPECAO"       // ponto de qualidade
  | "ESTOCAGEM_PA";  // estoque de produto acabado

export const NODE_KINDS: NodeKind[] = [
  "ESTOQUE_INSUMO",
  "OPERACAO",
  "TRANSPORTE",
  "BUFFER_WIP",
  "INSPECAO",
  "ESTOCAGEM_PA",
];

export interface InsumoVinculo {
  itemId: string;
  descricao?: string;
  consumoPorMilheiro?: number | null;
}

// Config por nó — todos os campos opcionais; o painel renderiza por `kind`.
// A index signature mantém compatibilidade com o `data: Record<string, unknown>`
// exigido pelo React Flow (xyflow) v12 nos nós custom.
export interface FlowNodeData {
  [key: string]: unknown;
  kind: NodeKind;
  label: string;
  // estoque/insumo & produto acabado
  categoriaEstoque?: string | null;
  itemId?: string | null;
  itemDescricao?: string | null;
  // múltiplos produtos numa etapa de estoque/WIP (a fonte de verdade nos nós de estoque)
  itens?: { itemId: string; descricao: string }[];
  localEstoqueId?: string | null;
  // operação / transporte / inspeção
  centroTrabalhoId?: string | null;
  centroTrabalhoNome?: string | null;
  setupMin?: number | null;
  tempoCicloSeg?: number | null;
  tempoCicloHoras?: number | null; // duração do ciclo da etapa em horas (lead time)
  capacidade?: number | null;
  unidadeCapacidade?: string | null;
  perdaPct?: number | null;
  // buffer de WIP
  estadoWip?: EstadoWIP | null;
  // janela / curva (secagem e queima)
  janelaMinH?: number | null;
  janelaMaxH?: number | null;
  loteVagao?: number | null;
  loteVagoneta?: number | null;
  // insumos vinculados à etapa (água, caco, biomassa, argila)
  insumos?: InsumoVinculo[];
  // subproduto/resíduo gerado pela operação (ex.: caco) que volta ao estoque como insumo
  subprodutoItemId?: string | null;
  subprodutoDescricao?: string | null;
  // produtos possíveis da operação (saída), estruturados conforme a engenharia do produto
  produtosPossiveis?: { itemId: string; codigo?: string; descricao: string }[];
  // marcação calculada pelo validador (não persiste como verdade)
  isBottleneck?: boolean;
}

export interface FlowNode {
  id: string;
  type: string; // = kind (registrado em nodeTypes do React Flow)
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export const KIND_LABEL: Record<NodeKind, string> = {
  ESTOQUE_INSUMO: "Local de estoque",
  OPERACAO: "Operação",
  TRANSPORTE: "Transporte",
  BUFFER_WIP: "Buffer de WIP",
  INSPECAO: "Inspeção",
  ESTOCAGEM_PA: "Produto Acabado",
};

// Nós que podem ser fonte (sem entrada) ou sink (sem saída) sem virar "órfão".
export const SOURCE_KINDS: NodeKind[] = ["ESTOQUE_INSUMO"];
export const SINK_KINDS: NodeKind[] = ["ESTOCAGEM_PA"];

export function emptyGraph(): FlowGraph {
  return { nodes: [], edges: [] };
}

// Produtos de um nó de estoque/WIP (múltiplos). Fallback no itemId legado (1 item).
export function nodeItens(data: FlowNodeData): { itemId: string; descricao: string }[] {
  if (data.itens && data.itens.length) return data.itens;
  if (data.itemId) return [{ itemId: data.itemId, descricao: (data.itemDescricao as string) ?? "item" }];
  return [];
}
