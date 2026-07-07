import type { Edge, Node } from "@xyflow/react";
import type { FunilNoData, TipoFunilNo } from "@/lib/validations/marketing-funil";
import type { NoForecast } from "./forecast";

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
  _modoForecast?: boolean;
  _forecast?: NoForecast | null; // fluxo/receita projetados (modo forecast)
  _investimento?: number | null; // orçamento da campanha vinculada (nós FONTE)
};

export type FunilEdgeData = {
  taxa?: number | null; // taxa do forecast (persiste no canvas)
  _taxa?: number | null; // taxa aproximada calculada no modo análise
  _readonly?: boolean;
  _modoForecast?: boolean;
  _taxaEfetiva?: number | null; // taxa explícita ou default (100% em saída única)
  _semTaxa?: boolean; // sem taxa em source com múltiplas saídas → "definir %"
  _ignorada?: boolean; // aresta ignorada por fechar ciclo
  _pessoas?: number | null; // fluxo que passa pela aresta (forecast/análise)
};

export type FunilFlowNode = Node<FunilNodeData>;
export type FunilFlowEdge = Edge<FunilEdgeData>;

export type ModoCanvas = "desenho" | "forecast" | "analise";

// orcamento vem serializado da API (Decimal → string); use Number() p/ somar.
export type CampanhaOpt = { id: string; nome: string; plataforma: string; orcamento?: string | number | null };
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
