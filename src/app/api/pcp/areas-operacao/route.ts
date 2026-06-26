export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { snapshotEtapas } from "@/lib/pcp/snapshot-etapas";
import type { FlowGraph } from "@/lib/pcp/types";

// GET /api/pcp/areas-operacao — nomes distintos das operações (etapas) dos fluxos
// publicados. Usado no cadastro do colaborador p/ marcar em quais áreas ele atua.
export async function GET() {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const fluxos = await prisma.fluxoProducao.findMany({ where: { versaoAtivaId: { not: null } }, select: { versaoAtivaId: true } });
  const versaoIds = fluxos.map((f) => f.versaoAtivaId!).filter(Boolean);
  const versoes = versaoIds.length
    ? await prisma.fluxoProducaoVersao.findMany({ where: { id: { in: versaoIds } }, select: { grafo: true } })
    : [];

  const nomes = new Set<string>();
  for (const v of versoes) {
    const etapas = snapshotEtapas((v.grafo as unknown as FlowGraph) ?? { nodes: [], edges: [] });
    for (const e of etapas) if (e.nome) nomes.add(e.nome);
  }

  return NextResponse.json({ data: Array.from(nomes).sort((a, b) => a.localeCompare(b)) });
}
