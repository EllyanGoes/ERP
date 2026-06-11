export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { fetchAtivosTree, countLeaves, type TreeNode } from "@/lib/pcm-ativos";
import { engemanErrorResponse } from "@/lib/engeman";

// Re-exporta para compatibilidade com quem já importa daqui
// (pcm/relatorio-mtbf).
export type { TreeNode };

export interface AplicacoesResponse {
  tree: TreeNode[]; // começa no nível 2 (áreas); a raiz de nível 1 é removida
  leafCount: number;
  source: "db";
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function GET() {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

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
