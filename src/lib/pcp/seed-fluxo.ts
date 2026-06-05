// Fluxo de exemplo espelhando a operação Tramontin (cerâmica vermelha).
// Serve para o usuário ver o conceito de cara e ajustar.

import type { FlowGraph, FlowNode, FlowEdge, NodeKind, FlowNodeData } from "./types";

function node(id: string, kind: NodeKind, x: number, y: number, data: Partial<FlowNodeData>): FlowNode {
  return { id, type: kind, position: { x, y }, data: { kind, label: id, ...data } as FlowNodeData };
}
function edge(s: string, t: string): FlowEdge {
  return { id: `e_${s}_${t}`, source: s, target: t };
}

export function seedTramontin(): FlowGraph {
  const Y = 220;
  const nodes: FlowNode[] = [
    // Insumos / matéria-prima
    node("mp", "ESTOQUE_INSUMO", 0, Y, { label: "Matéria-prima", itemDescricao: "Argila" }),
    node("caco", "ESTOQUE_INSUMO", 0, Y - 150, { label: "Caco de tijolo", itemDescricao: "Caco (britagem)" }),
    node("agua", "ESTOQUE_INSUMO", 0, Y + 150, { label: "Água", itemDescricao: "Água" }),
    node("biomassa", "ESTOQUE_INSUMO", 1320, Y - 170, { label: "Caroço de açaí", itemDescricao: "Biomassa" }),

    // Cadeia principal
    node("prep", "OPERACAO", 240, Y, { label: "Preparação", capacidade: 40, unidadeCapacidade: "milheiro/dia", perdaPct: 1 }),
    node("conf", "OPERACAO", 480, Y, { label: "Conformação", capacidade: 40, unidadeCapacidade: "milheiro/dia", perdaPct: 2 }),
    node("wip_umido", "BUFFER_WIP", 720, Y, { label: "Pátio úmido", estadoWip: "UMIDO" }),
    node("secagem", "OPERACAO", 960, Y, { label: "Secagem", capacidade: 30, unidadeCapacidade: "milheiro/ciclo", perdaPct: 5, janelaMinH: 48, janelaMaxH: 96 }),
    node("wip_seco", "BUFFER_WIP", 1200, Y, { label: "Pátio seco", estadoWip: "SECO" }),
    node("queima", "OPERACAO", 1440, Y, { label: "Queima", capacidade: 20, unidadeCapacidade: "milheiro/ciclo", perdaPct: 8, janelaMinH: 24, janelaMaxH: 48, insumos: [{ itemId: "", descricao: "Caroço de açaí", consumoPorMilheiro: 75 }] }),
    node("wip_queimado", "BUFFER_WIP", 1680, Y, { label: "Pré-forno / queimado", estadoWip: "QUEIMADO" }),
    node("embalar", "OPERACAO", 1920, Y, { label: "Embalar", capacidade: 50, unidadeCapacidade: "milheiro/dia", perdaPct: 0.5 }),
    node("pa", "ESTOCAGEM_PA", 2160, Y, { label: "Produto acabado", itemDescricao: "Tijolo 6 furos" }),
  ];

  const edges: FlowEdge[] = [
    edge("mp", "prep"),
    edge("caco", "prep"),
    edge("agua", "prep"),
    edge("prep", "conf"),
    edge("conf", "wip_umido"),
    edge("wip_umido", "secagem"),
    edge("secagem", "wip_seco"),
    edge("wip_seco", "queima"),
    edge("biomassa", "queima"),
    edge("queima", "wip_queimado"),
    edge("wip_queimado", "embalar"),
    edge("embalar", "pa"),
  ];

  return { nodes, edges };
}
