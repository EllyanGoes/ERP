export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fetchAtivosTree, type TreeNode } from "@/lib/pcm-ativos";
import { engemanErrorResponse } from "@/lib/engeman";

// GET /api/sst/maquinas/engeman — ativos do Engeman (lista plana) com a marca
// dos que já estão no inventário SST da empresa ativa.
export async function GET() {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  let tree: TreeNode[];
  try { tree = await fetchAtivosTree(); } catch (err) { return engemanErrorResponse("SST /api/sst/maquinas/engeman", err); }
  const flat: { codApl: number; tag: string; descricao: string; caminho: string }[] = [];
  const walk = (nodes: TreeNode[], trilha: string[]) => {
    for (const n of nodes) {
      flat.push({ codApl: n.codApl, tag: n.tag, descricao: n.descricao, caminho: trilha.join(" › ") });
      if (n.children?.length) walk(n.children, [...trilha, n.descricao]);
    }
  };
  walk(tree, []);
  const ja = new Set((await prisma.sstMaquina.findMany({ where: { codApl: { not: null } }, select: { codApl: true } })).map((m) => m.codApl));
  return NextResponse.json({ data: flat.map((f) => ({ ...f, jaCadastrada: ja.has(f.codApl) })) });
}
