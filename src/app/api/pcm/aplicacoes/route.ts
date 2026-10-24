export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { fetchAtivosTree, countLeaves, type TreeNode } from "@/lib/pcm-ativos";

// Re-exporta para compatibilidade com quem já importa daqui
// (pcm/relatorio-mtbf).
export type { TreeNode };

export interface AplicacoesResponse {
  tree: TreeNode[]; // árvore de ManutAtivo (ativos ativos) da empresa ativa
  leafCount: number;
  source: "db";
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function GET() {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const tree = await fetchAtivosTree();
  return NextResponse.json({
    tree,
    leafCount: countLeaves(tree),
    source: "db",
  } satisfies AplicacoesResponse);
}
