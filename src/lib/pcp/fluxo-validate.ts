// Validação pura do grafo de fluxo de produção.
// Usada no cliente (feedback ao vivo no editor) e no servidor (autoridade ao publicar).

import { type FlowGraph, type NodeKind, SOURCE_KINDS, SINK_KINDS } from "./types";

export interface ValidationIssue {
  level: "error" | "warning";
  message: string;
  nodeId?: string;
}

export interface ValidationResult {
  ok: boolean; // sem erros (warnings não bloqueiam a publicação)
  issues: ValidationIssue[];
  ordem: string[]; // ordem topológica dos nós (vazia se houver ciclo)
  bottleneckNodeId: string | null; // operação de menor capacidade (gargalo esperado: forno)
}

export function validarFluxo(graph: FlowGraph): ValidationResult {
  const issues: ValidationIssue[] = [];
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const indeg = new Map<string, number>();
  const outdeg = new Map<string, number>();
  for (const n of nodes) {
    indeg.set(n.id, 0);
    outdeg.set(n.id, 0);
  }
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
    outdeg.set(e.source, (outdeg.get(e.source) ?? 0) + 1);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
  }

  if (nodes.length === 0) {
    issues.push({
      level: "warning",
      message: "Fluxo vazio — adicione ao menos um estoque de insumo e um produto acabado.",
    });
    return { ok: true, issues, ordem: [], bottleneckNodeId: null };
  }

  const nome = (id: string) => nodeById.get(id)?.data?.label ?? id;

  // Órfãos + exigência de entrada/saída conforme o tipo
  for (const n of nodes) {
    const i = indeg.get(n.id) ?? 0;
    const o = outdeg.get(n.id) ?? 0;
    const kind = n.data?.kind as NodeKind;
    if (i === 0 && o === 0) {
      issues.push({ level: "error", message: `Nó "${nome(n.id)}" está solto (sem conexões).`, nodeId: n.id });
      continue;
    }
    if (!SOURCE_KINDS.includes(kind) && i === 0) {
      issues.push({ level: "error", message: `"${nome(n.id)}" não tem entrada (predecessora).`, nodeId: n.id });
    }
    if (!SINK_KINDS.includes(kind) && o === 0) {
      issues.push({ level: "error", message: `"${nome(n.id)}" não tem saída (sucessora).`, nodeId: n.id });
    }
  }

  // Precisa de ao menos uma fonte e um sink
  if (!nodes.some((n) => SOURCE_KINDS.includes(n.data?.kind as NodeKind))) {
    issues.push({ level: "error", message: "O fluxo precisa de ao menos um nó de Estoque / Insumo (fonte)." });
  }
  if (!nodes.some((n) => SINK_KINDS.includes(n.data?.kind as NodeKind))) {
    issues.push({ level: "error", message: "O fluxo precisa de ao menos um nó de Produto Acabado (saída)." });
  }

  // Ciclos via Kahn → ordem topológica
  const indegMut = new Map(indeg);
  const queue: string[] = [];
  for (const n of nodes) if ((indegMut.get(n.id) ?? 0) === 0) queue.push(n.id);
  const ordem: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordem.push(id);
    for (const t of adj.get(id) ?? []) {
      indegMut.set(t, (indegMut.get(t) ?? 0) - 1);
      if ((indegMut.get(t) ?? 0) === 0) queue.push(t);
    }
  }
  const temCiclo = ordem.length !== nodes.length;
  if (temCiclo) {
    issues.push({ level: "error", message: "O fluxo tem um ciclo (loop) — a produção deve seguir em uma direção." });
  }

  // Gargalo: menor capacidade entre operações com capacidade definida
  let bottleneckNodeId: string | null = null;
  let minCap = Infinity;
  for (const n of nodes) {
    if (n.data?.kind !== "OPERACAO") continue;
    const cap = n.data?.capacidade;
    if (cap == null || cap <= 0) {
      issues.push({ level: "warning", message: `Operação "${nome(n.id)}" sem capacidade definida.`, nodeId: n.id });
    } else if (cap < minCap) {
      minCap = cap;
      bottleneckNodeId = n.id;
    }
  }

  const ok = !issues.some((x) => x.level === "error");
  return { ok, issues, ordem: temCiclo ? [] : ordem, bottleneckNodeId };
}
