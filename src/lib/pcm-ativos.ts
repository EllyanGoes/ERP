import sql from "mssql";
import { getEngemanConfig } from "@/lib/engeman";

// ── Nó da árvore ────────────────────────────────────────────────────────────────
// Cada linha de APLIC É um nó na hierarquia do Engeman.
// TAGGRU guarda o endereço hierárquico do próprio nó (ex.: "001.001.003.").
// O pai imediato tem TAGGRU = endereço sem o último segmento.
// isLeaf = true quando nenhum outro nó ativo aponta para este como pai.
export interface TreeNode {
  codApl: number;
  tag: string;
  descricao: string;
  taggru: string;
  isLeaf: boolean;
  children: TreeNode[];
}

// ── Helpers puros ───────────────────────────────────────────────────────────────

/** TAGGRU do pai imediato ("001.001.003." → "001.001.") */
function parentTaggru(tg: string): string | null {
  const s = tg.endsWith(".") ? tg.slice(0, -1) : tg;
  const i = s.lastIndexOf(".");
  if (i < 0) return null;
  return s.slice(0, i + 1);
}

/** Número de segmentos separados por ponto ("001.001.003." → 3) */
function depth(tg: string): number {
  return (tg.match(/\./g) ?? []).length;
}

function sortTree(nodes: TreeNode[]) {
  nodes.sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
  for (const n of nodes) sortTree(n.children);
}

/** Conta as folhas (equipamentos finais) da árvore. */
export function countLeaves(nodes: TreeNode[]): number {
  return nodes.reduce((s, n) => s + (n.isLeaf ? 1 : countLeaves(n.children)), 0);
}

/** Percorre todos os nós da árvore (pré-ordem). */
export function forEachNode(nodes: TreeNode[], fn: (n: TreeNode) => void) {
  for (const n of nodes) {
    fn(n);
    forEachNode(n.children, fn);
  }
}

// ── Busca a árvore de ativos do Engeman ──────────────────────────────────────────
/**
 * Monta a árvore de ativos a partir da tabela APLIC do Engeman (TAGGRU).
 * O nível 1 (raiz, ex.: "PLANTA FABRIL") é removido — a árvore começa nas áreas
 * (nível 2+). Lança em caso de falha de conexão (o chamador trata como 503).
 *
 * Fonte única reusada por GET /api/pcm/aplicacoes e GET /api/pcm/ativos.
 */
export async function fetchAtivosTree(): Promise<TreeNode[]> {
  const pool = await sql.connect(await getEngemanConfig());
  try {
    const result = await pool.request().query<{
      CODAPL: number;
      TAG: string;
      DESCRICAO: string;
      TAGGRU: string | null;
    }>(`
      SELECT
        a.CODAPL,
        RTRIM(ISNULL(a.TAG,       CAST(a.CODAPL AS VARCHAR(20)))) AS TAG,
        RTRIM(ISNULL(a.DESCRICAO, 'Sem descrição'))                AS DESCRICAO,
        a.TAGGRU
      FROM APLIC a
      WHERE a.ATIVO = 'S'
      ORDER BY a.TAGGRU, a.TAG
    `);

    // 1. mapa de nós chaveado por TAGGRU (endereço posicional único)
    const nodeMap = new Map<string, TreeNode>();
    for (const r of result.recordset) {
      const tg = r.TAGGRU?.trim() ?? null;
      if (!tg) continue; // ignora linhas sem TAGGRU
      if (nodeMap.has(tg)) continue; // cada posição é única
      nodeMap.set(tg, {
        codApl: r.CODAPL,
        tag: r.TAG,
        descricao: r.DESCRICAO,
        taggru: tg,
        isLeaf: true,
        children: [],
      });
    }

    // 2. liga pai ↔ filho
    const roots: TreeNode[] = [];
    for (const node of Array.from(nodeMap.values())) {
      const pTg = parentTaggru(node.taggru);
      if (pTg && nodeMap.has(pTg)) {
        const parent = nodeMap.get(pTg)!;
        parent.isLeaf = false;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // 3. ordena cada nível
    sortTree(roots);

    // 4. remove a raiz de nível 1 → expõe os filhos dela
    return roots.flatMap((r) => (depth(r.taggru) <= 1 ? r.children : [r]));
  } finally {
    await pool.close();
  }
}
