export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import sql from "mssql";
import { getEngemanConfig } from "@/lib/engeman";

// ── Tree node ──────────────────────────────────────────────────────────────────
// Each APLIC row IS a node in the Engeman hierarchy.
// TAGGRU stores the node's own hierarchical address (e.g. "001.001.003.").
// The immediate parent has TAGGRU = address minus last segment.
// isLeaf = true when no other active node's parent address points here.
export interface TreeNode {
  codApl:   number;
  tag:      string;
  descricao: string;
  taggru:   string;
  isLeaf:   boolean;
  children: TreeNode[];
}

export interface AplicacoesResponse {
  tree:      TreeNode[];  // starts at level 2 (areas); level-1 root is stripped
  leafCount: number;
  source:    "db";
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

/** TAGGRU of the immediate parent ("001.001.003." → "001.001.") */
function parentTaggru(tg: string): string | null {
  const s = tg.endsWith(".") ? tg.slice(0, -1) : tg;
  const i = s.lastIndexOf(".");
  if (i < 0) return null;
  return s.slice(0, i + 1);
}

/** Number of dot-separated segments ("001.001.003." → 3) */
function depth(tg: string): number {
  return (tg.match(/\./g) ?? []).length;
}

function sortTree(nodes: TreeNode[]) {
  nodes.sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
  for (const n of nodes) sortTree(n.children);
}

function countLeaves(nodes: TreeNode[]): number {
  return nodes.reduce((s, n) => s + (n.isLeaf ? 1 : countLeaves(n.children)), 0);
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const pool = await sql.connect(await getEngemanConfig());

    const result = await pool.request().query<{
      CODAPL:    number;
      TAG:       string;
      DESCRICAO: string;
      TAGGRU:    string | null;
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

    await pool.close();

    // ── 1. Build node map keyed by TAGGRU (unique positional address) ──────────
    const nodeMap = new Map<string, TreeNode>();

    for (const r of result.recordset) {
      const tg = r.TAGGRU?.trim() ?? null;
      if (!tg) continue;                       // skip rows with no TAGGRU
      if (nodeMap.has(tg)) continue;           // each position is unique
      nodeMap.set(tg, {
        codApl:    r.CODAPL,
        tag:       r.TAG,
        descricao: r.DESCRICAO,
        taggru:    tg,
        isLeaf:    true,
        children:  [],
      });
    }

    // ── 2. Wire parent ↔ child ─────────────────────────────────────────────────
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

    // ── 3. Sort every level ────────────────────────────────────────────────────
    sortTree(roots);

    // ── 4. Strip level-1 root (e.g. "PLANTA FABRIL") → expose its children ────
    const tree = roots.flatMap((r) =>
      depth(r.taggru) <= 1 ? r.children : [r]
    );

    return NextResponse.json({
      tree,
      leafCount: countLeaves(tree),
      source: "db",
    } satisfies AplicacoesResponse);
  } catch (err) {
    console.error(
      "[PCM /api/pcm/aplicacoes] Engeman inacessível:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: "Engeman inacessível" }, { status: 503 });
  }
}
