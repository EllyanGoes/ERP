export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fetchAtivosTree, flattenTree } from "@/lib/pcm-ativos";

// GET /api/sst/maquinas/ativos — ativos da Manutenção (lista plana) com a marca
// dos que já estão no inventário SST da empresa ativa. Base do "Vincular ativos
// da Manutenção" (substitui a antiga importação do Engeman).
export async function GET() {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const [tree, maquinas] = await Promise.all([
    fetchAtivosTree(),
    prisma.sstMaquina.findMany({ where: { codApl: { not: null } }, select: { codApl: true } }),
  ]);
  const ja = new Set(maquinas.map((m) => m.codApl));
  const data = flattenTree(tree).map((a) => ({
    id: a.id, codApl: a.codApl, tag: a.tag, descricao: a.descricao, tipo: a.tipo, caminho: a.caminho,
    jaCadastrada: ja.has(a.codApl),
  }));
  return NextResponse.json({ data });
}
