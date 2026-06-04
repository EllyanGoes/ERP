export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { fetchAtivosTree, countLeaves, type TreeNode } from "@/lib/pcm-ativos";

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
    console.error(
      "[PCM /api/pcm/aplicacoes] Engeman inacessível:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: "Engeman inacessível" }, { status: 503 });
  }
}
