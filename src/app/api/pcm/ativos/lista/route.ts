export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireModuloAny } from "@/lib/permissions";
import { fetchAtivosTree, flattenTree } from "@/lib/pcm-ativos";

export interface AtivoOpcao {
  id: string;
  codApl: number;
  tag: string;
  descricao: string;
  tipo: string;
  caminho: string; // ancestrais "A › B"
  nivel: number;
}

// GET /api/pcm/ativos/lista — ativos ativos da empresa em lista plana (ordem
// da árvore). Consumida pelos droplists de ativo no SST (máquinas), PCP
// (centros de trabalho) e na própria Manutenção (pai do ativo).
export async function GET() {
  const auth = await requireModuloAny(["pcm", "sst", "pcp"]);
  if (!auth.ok) return auth.response;

  const tree = await fetchAtivosTree();
  const data: AtivoOpcao[] = flattenTree(tree).map((a) => ({
    id: a.id, codApl: a.codApl, tag: a.tag, descricao: a.descricao, tipo: a.tipo, caminho: a.caminho, nivel: a.nivel,
  }));
  return NextResponse.json({ data });
}
