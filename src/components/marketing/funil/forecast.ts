// Motor de forecast do funil — puro (sem React), testável isoladamente.
//
// Modelo (estilo Funnelytics):
// - Nós FONTE entram com `data.volume` (entrada projetada no período).
// - Cada aresta transporta fluxo = fluxo(source) × taxa/100.
// - Taxa default de aresta SEM `data.taxa`:
//     • 100% quando o source tem UMA única aresta de saída (passagem integral);
//     • indefinida (contribui 0) quando o source tem MÚLTIPLAS saídas — o
//       usuário precisa distribuir os percentuais; a aresta entra em
//       `arestasSemTaxa` p/ a UI mostrar "definir %".
// - O desenho é livre e pode ter ciclo: arestas que fecham ciclo (back edges
//   detectadas por DFS) são ignoradas na propagação e listadas em
//   `arestasIgnoradas` p/ a UI avisar. Quais arestas "fecham" o ciclo depende
//   da ordem de visita — determinística p/ o mesmo canvas.

export interface ForecastNoInput {
  id: string;
  data: { tipo: string; volume?: number | null; valorMedio?: number | null };
}

export interface ForecastEdgeInput {
  id: string;
  source: string;
  target: string;
  data?: { taxa?: number | null } | undefined;
}

export interface NoForecast {
  fluxo: number;
  receita: number;
}

export interface ForecastResultado {
  /** Soma dos volumes projetados dos nós FONTE. */
  totalEntrada: number;
  /** Fluxo/receita por nó, nas chaves em ORDEM TOPOLÓGICA (fontes → fundo). */
  porNo: Record<string, NoForecast>;
  /**
   * Receita projetada: soma das receitas dos nós ETAPA_OFFLINE com valorMedio;
   * se nenhum tiver valorMedio, soma geral de todos os nós.
   */
  receitaTotal: number;
  /** Arestas sem taxa em source com múltiplas saídas (contribuem 0). */
  arestasSemTaxa: string[];
  /** Arestas ignoradas por fecharem ciclo. */
  arestasIgnoradas: string[];
}

/** Nº de arestas de saída por nó (estrutura desenhada, inclui as de ciclo). */
export function contarSaidas(edges: ForecastEdgeInput[]): Map<string, number> {
  const saidas = new Map<string, number>();
  for (const e of edges) saidas.set(e.source, (saidas.get(e.source) ?? 0) + 1);
  return saidas;
}

/**
 * Taxa efetiva de uma aresta: a explícita (`data.taxa`) ou o default de saída
 * única (100). Retorna null quando indefinida (múltiplas saídas sem taxa) —
 * a UI mostra "definir %" e o cálculo trata como 0.
 */
export function taxaEfetivaAresta(edge: ForecastEdgeInput, saidasDoSource: number): number | null {
  const taxa = edge.data?.taxa;
  if (taxa != null) return taxa;
  return saidasDoSource <= 1 ? 100 : null;
}

export function calcularForecast(nodes: ForecastNoInput[], edges: ForecastEdgeInput[]): ForecastResultado {
  const nosPorId = new Map(nodes.map((n) => [n.id, n]));
  const validas = edges.filter((e) => nosPorId.has(e.source) && nosPorId.has(e.target));
  const saidasPorSource = contarSaidas(validas);

  // ── 1. Detecta arestas que fecham ciclo (back edges) via DFS ──
  const adj = new Map<string, ForecastEdgeInput[]>();
  for (const e of validas) {
    const lista = adj.get(e.source);
    if (lista) lista.push(e);
    else adj.set(e.source, [e]);
  }
  const BRANCO = 0, CINZA = 1, PRETO = 2;
  const cor = new Map<string, number>();
  const ignoradas = new Set<string>();
  const visitar = (u: string) => {
    cor.set(u, CINZA);
    for (const e of adj.get(u) ?? []) {
      const c = cor.get(e.target) ?? BRANCO;
      if (c === CINZA) ignoradas.add(e.id); // fecha ciclo
      else if (c === BRANCO) visitar(e.target);
    }
    cor.set(u, PRETO);
  };
  for (const n of nodes) {
    if ((cor.get(n.id) ?? BRANCO) === BRANCO) visitar(n.id);
  }

  // ── 2. Ordem topológica (Kahn) sobre o DAG restante ──
  const ativas = validas.filter((e) => !ignoradas.has(e.id));
  const adjAtivas = new Map<string, ForecastEdgeInput[]>();
  const grauEntrada = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const e of ativas) {
    const lista = adjAtivas.get(e.source);
    if (lista) lista.push(e);
    else adjAtivas.set(e.source, [e]);
    grauEntrada.set(e.target, (grauEntrada.get(e.target) ?? 0) + 1);
  }
  const fila = nodes.filter((n) => (grauEntrada.get(n.id) ?? 0) === 0).map((n) => n.id);
  const ordem: string[] = [];
  while (fila.length > 0) {
    const u = fila.shift()!;
    ordem.push(u);
    for (const e of adjAtivas.get(u) ?? []) {
      const g = (grauEntrada.get(e.target) ?? 0) - 1;
      grauEntrada.set(e.target, g);
      if (g === 0) fila.push(e.target);
    }
  }

  // ── 3. Propagação do fluxo ──
  const fluxo = new Map<string, number>();
  let totalEntrada = 0;
  for (const n of nodes) {
    const vol = n.data.tipo === "FONTE" ? n.data.volume ?? 0 : 0;
    fluxo.set(n.id, vol);
    if (n.data.tipo === "FONTE") totalEntrada += vol;
  }
  const semTaxa: string[] = [];
  for (const id of ordem) {
    const f = fluxo.get(id) ?? 0;
    for (const e of adjAtivas.get(id) ?? []) {
      const taxa = taxaEfetivaAresta(e, saidasPorSource.get(e.source) ?? 0);
      if (taxa == null) {
        semTaxa.push(e.id);
        continue; // indefinida → contribui 0
      }
      fluxo.set(e.target, (fluxo.get(e.target) ?? 0) + (f * taxa) / 100);
    }
  }

  // ── 4. Resultado por nó (em ordem topológica) e receita ──
  const porNo: Record<string, NoForecast> = {};
  for (const id of ordem) {
    const n = nosPorId.get(id)!;
    const f = fluxo.get(id) ?? 0;
    porNo[id] = { fluxo: f, receita: f * (n.data.valorMedio ?? 0) };
  }

  const offlineComValor = nodes.filter((n) => n.data.tipo === "ETAPA_OFFLINE" && n.data.valorMedio != null);
  let receitaTotal = 0;
  if (offlineComValor.length > 0) {
    for (const n of offlineComValor) receitaTotal += porNo[n.id]?.receita ?? 0;
  } else {
    for (const r of Object.values(porNo)) receitaTotal += r.receita;
  }

  return {
    totalEntrada,
    porNo,
    receitaTotal,
    arestasSemTaxa: semTaxa,
    arestasIgnoradas: Array.from(ignoradas),
  };
}
