export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { snapshotEtapas } from "@/lib/pcp/snapshot-etapas";
import type { FlowGraph } from "@/lib/pcp/types";

// GET /api/pcp/ordens/area/abas?fluxoId= — áreas (abas) do fluxo publicado + os
// produtos fabricáveis nesse fluxo. Usado pelo board pra montar as abas por área.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const fluxoId = new URL(req.url).searchParams.get("fluxoId") ?? "";
  if (!fluxoId) return NextResponse.json({ error: "fluxoId é obrigatório" }, { status: 400 });

  const fluxo = await prisma.fluxoProducao.findUnique({ where: { id: fluxoId } });
  if (!fluxo) return NextResponse.json({ error: "Fluxo não encontrado" }, { status: 404 });
  if (!fluxo.versaoAtivaId) return NextResponse.json({ areas: [], produtos: [], aviso: "Fluxo sem versão publicada." });

  const [versao, engs] = await Promise.all([
    prisma.fluxoProducaoVersao.findUnique({ where: { id: fluxo.versaoAtivaId }, select: { grafo: true } }),
    prisma.engenhariaProduto.findMany({
      where: { fluxoId, ativo: true },
      select: { item: { select: { id: true, codigo: true, descricao: true } } },
    }),
  ]);

  const etapas = snapshotEtapas((versao?.grafo as unknown as FlowGraph) ?? { nodes: [], edges: [] });
  let prevEstado: string | null = null;
  const areas = etapas.map((e) => {
    const fromEstado = prevEstado;
    if (e.estadoSaida) prevEstado = e.estadoSaida;
    return {
      nodeId: e.nodeId,
      sequencia: e.sequencia,
      nome: e.nome,
      centroTrabalho: e.centroTrabalho,
      estadoSaida: e.estadoSaida,
      fromEstado,
      isPrimeira: fromEstado === null,
    };
  });

  const produtos = engs.filter((e) => e.item).map((e) => ({ id: e.item!.id, codigo: e.item!.codigo, descricao: e.item!.descricao }));

  return NextResponse.json({ areas, produtos });
}
