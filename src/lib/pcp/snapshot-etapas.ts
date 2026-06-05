// Snapshot das etapas apontáveis de um grafo publicado, em ordem topológica.
// Só viram etapas os nós de processo: operação, transporte e inspeção
// (estoques e buffers de WIP são estados/estoques, não etapas de apontamento).

import { validarFluxo } from "./fluxo-validate";
import type { FlowGraph, FlowNodeData, NodeKind } from "./types";

export interface EtapaSnapshot {
  nodeId: string;
  sequencia: number;
  nome: string;
  kind: NodeKind;
  centroTrabalho: string | null;
  estadoSaida: string | null; // EstadoWIP serializado
  tempoCicloHoras: number | null;
  subprodutoItemId: string | null;
  subprodutoDescricao: string | null;
}

const ETAPA_KINDS = new Set<NodeKind>(["OPERACAO", "TRANSPORTE", "INSPECAO"]);

export function snapshotEtapas(grafo: FlowGraph): EtapaSnapshot[] {
  const nodes = grafo?.nodes ?? [];
  const { ordem } = validarFluxo(grafo);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // Se houver ciclo (ordem vazia), cai para a ordem de inserção como fallback.
  const ordered = ordem.length ? ordem : nodes.map((n) => n.id);

  const etapas: EtapaSnapshot[] = [];
  let seq = 0;
  for (const id of ordered) {
    const n = byId.get(id);
    if (!n) continue;
    const d = n.data as FlowNodeData;
    if (!ETAPA_KINDS.has(d.kind)) continue;
    seq += 1;
    etapas.push({
      nodeId: id,
      sequencia: seq,
      nome: d.label || d.kind,
      kind: d.kind,
      centroTrabalho: (d.centroTrabalhoNome as string) ?? null,
      estadoSaida: (d.estadoWip as string) ?? null,
      tempoCicloHoras: (d.tempoCicloHoras as number) ?? null,
      subprodutoItemId: (d.subprodutoItemId as string) ?? null,
      subprodutoDescricao: (d.subprodutoDescricao as string) ?? null,
    });
  }
  return etapas;
}
