export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { snapshotEtapas } from "@/lib/pcp/snapshot-etapas";
import type { FlowGraph } from "@/lib/pcp/types";

// GET /api/pcp/ordens/area/materiais?fluxoId=&areaNodeId=
// Materiais (insumos) configurados na OPERAÇÃO daquela área no fluxo + saldo em
// estoque. Ex.: "Mistura de insumos" → serragem fina/grossa.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const sp = new URL(req.url).searchParams;
  const fluxoId = sp.get("fluxoId") ?? "";
  const areaNodeId = sp.get("areaNodeId") ?? "";
  if (!fluxoId || !areaNodeId) return NextResponse.json({ error: "fluxoId e areaNodeId são obrigatórios" }, { status: 400 });

  const fluxo = await prisma.fluxoProducao.findUnique({ where: { id: fluxoId }, select: { versaoAtivaId: true } });
  if (!fluxo?.versaoAtivaId) return NextResponse.json({ data: [] });
  const versao = await prisma.fluxoProducaoVersao.findUnique({ where: { id: fluxo.versaoAtivaId }, select: { grafo: true } });

  const etapas = snapshotEtapas((versao?.grafo as unknown as FlowGraph) ?? { nodes: [], edges: [] });
  const area = etapas.find((e) => e.nodeId === areaNodeId);
  const insumos = (area?.insumos ?? []).filter((i) => i.itemId);
  const ids = Array.from(new Set(insumos.map((i) => i.itemId)));
  if (!ids.length) return NextResponse.json({ data: [] });

  const [itens, estoques] = await Promise.all([
    prisma.item.findMany({ where: { id: { in: ids } }, select: { id: true, descricao: true, unidadeMedida: true } }),
    prisma.estoqueItem.groupBy({ by: ["itemId"], where: { itemId: { in: ids }, clienteDonoId: null }, _sum: { quantidadeAtual: true } }),
  ]);
  const itMap = new Map(itens.map((i) => [i.id, i]));
  const saldoMap = new Map(estoques.map((e) => [e.itemId, Number(e._sum.quantidadeAtual ?? 0)]));

  const data = insumos.map((ins) => ({
    itemId: ins.itemId,
    descricao: itMap.get(ins.itemId)?.descricao ?? ins.descricao ?? ins.itemId,
    saldo: Math.round((saldoMap.get(ins.itemId) ?? 0) * 1000) / 1000,
    unidade: itMap.get(ins.itemId)?.unidadeMedida ?? null,
  }));

  return NextResponse.json({ data });
}
