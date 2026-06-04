export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { fetchAtivosTree, countLeaves, type TreeNode } from "@/lib/pcm-ativos";
import { engemanErrorResponse } from "@/lib/engeman";

// Re-exporta para compatibilidade com quem já importa daqui
// (pcm/dashboard e pcm/relatorio-mtbf).
export type { TreeNode };

export interface AplicacoesResponse {
  tree: TreeNode[]; // começa no nível 2 (áreas); a raiz de nível 1 é removida
  leafCount: number;
  source: "db";
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const tree = await fetchAtivosTree();
    return NextResponse.json({
      tree,
      leafCount: countLeaves(tree),
      source: "db",
    } satisfies AplicacoesResponse);
  } catch (err) {
    return engemanErrorResponse("PCM /api/pcm/aplicacoes", err);
  }
}
