// Snapshot das etapas apontáveis de um grafo publicado, em ordem topológica.
// Só viram etapas os nós de processo: operação, transporte e inspeção
// (estoques e buffers de WIP são estados/estoques, não etapas de apontamento).

import { validarFluxo } from "./fluxo-validate";
import type { FlowGraph, FlowNodeData, NodeKind } from "./types";

export interface EtapaInsumoSnapshot {
  itemId: string;
  descricao: string | null;
  consumoPorMilheiro: number | null;
}

export interface EtapaSnapshot {
  nodeId: string;
  sequencia: number;
  nome: string;
  kind: NodeKind;
  centroTrabalho: string | null;
  estadoSaida: string | null; // EstadoWIP serializado
  produtoSaidaId: string | null; // produto que esta operação produz (áreas sem WIP)
  tempoCicloHoras: number | null;
  subprodutoItemId: string | null;
  subprodutoDescricao: string | null;
  insumos: EtapaInsumoSnapshot[]; // insumos consumidos na etapa (custeio por fase)
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
    const insumos: EtapaInsumoSnapshot[] = (d.insumos ?? [])
      .filter((i) => i && typeof i.itemId === "string" && i.itemId)
      .map((i) => ({
        itemId: i.itemId,
        descricao: i.descricao ?? null,
        consumoPorMilheiro: i.consumoPorMilheiro ?? null,
      }));
    etapas.push({
      nodeId: id,
      sequencia: seq,
      nome: d.label || d.kind,
      kind: d.kind,
      centroTrabalho: (d.centroTrabalhoNome as string) ?? null,
      estadoSaida: (d.estadoWip as string) ?? null,
      produtoSaidaId: (d.produtoSaidaId as string) ?? null,
      tempoCicloHoras: (d.tempoCicloHoras as number) ?? null,
      subprodutoItemId: (d.subprodutoItemId as string) ?? null,
      subprodutoDescricao: (d.subprodutoDescricao as string) ?? null,
      insumos,
    });
  }
  return etapas;
}
