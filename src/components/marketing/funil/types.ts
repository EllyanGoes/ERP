import type { Edge, Node } from "@xyflow/react";
import type { FunilNoData, TipoFunilNo } from "@/lib/validations/marketing-funil";

// Métricas agregadas de um nó no período analisado (vem de /metricas).
export type NoMetricas = {
  visitantes: number;
  leads: number;
  conversoes: number;
  receita: number;
  porFonte?: Record<string, unknown>;
};

// Campos com prefixo "_" são voláteis: injetados só para exibição
// (modo análise / nomes resolvidos) e NUNCA persistidos no canvas.
export type FunilNodeData = FunilNoData & {
  _metricas?: NoMetricas | null;
  _campanhaNome?: string | null;
  _etapaNome?: string | null;
  _analise?: boolean;
};

export type FunilEdgeData = {
  taxa?: number | null; // reservado p/ forecast (Fase 2)
  _taxa?: number | null; // taxa aproximada calculada no modo análise
  _readonly?: boolean;
};

export type FunilFlowNode = Node<FunilNodeData>;
export type FunilFlowEdge = Edge<FunilEdgeData>;

export type ModoCanvas = "desenho" | "analise";

export type CampanhaOpt = { id: string; nome: string; plataforma: string };
export type EtapaLeadOpt = { id: string; nome: string; ordem: number; cor: string | null; ganho: boolean };

export type MetricasFunil = {
  nos: Record<string, NoMetricas>;
  leadsPorEtapa: Record<string, number>;
};

export type FunilDetalhe = {
  id: string;
  nome: string;
  descricao: string | null;
  status: "RASCUNHO" | "ATIVO" | "ARQUIVADO";
  canvas: { nodes: FunilFlowNode[]; edges: FunilFlowEdge[] } | null;
  forecast?: Record<string, unknown> | null;
};

// Métrica "base" de um nó p/ taxa das arestas: a primeira preenchida na
// ordem visitantes → leads → conversões (um nó de página conta visitantes,
// um de etapa conta leads, etc.).
export function metricaBase(m: NoMetricas | null | undefined): number {
  if (!m) return 0;
  return m.visitantes || m.leads || m.conversoes || 0;
}

export const TIPO_FUNIL_LABEL: Record<TipoFunilNo, string> = {
  FONTE: "Fonte de tráfego",
  PAGINA: "Página",
  ACAO: "Ação",
  ETAPA_OFFLINE: "Etapa offline",
};
