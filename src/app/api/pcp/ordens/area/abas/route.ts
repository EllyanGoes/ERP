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
      select: { item: { select: { id: true, codigo: true, descricao: true, vendavel: true } } },
    }),
  ]);

  const todos = engs.map((e) => e.item).filter((x): x is NonNullable<typeof x> => !!x);
  const lite = (p: { id: string; codigo: string; descricao: string }) => ({ id: p.id, codigo: p.codigo, descricao: p.descricao });
  const vendaveis = todos.filter((p) => p.vendavel).map(lite);
  const byId = new Map(todos.map((p) => [p.id, lite(p)]));

  const etapas = snapshotEtapas((versao?.grafo as unknown as FlowGraph) ?? { nodes: [], edges: [] });
  let prevEstado: string | null = null;
  const areas = etapas.map((e) => {
    const fromEstado = prevEstado;
    if (e.estadoSaida) prevEstado = e.estadoSaida;
    // Produtos que ESTA área produz: o produto de saída (se configurado na operação),
    // senão os produtos vendáveis (tijolos) p/ as áreas de WIP.
    const ps = e.produtoSaidaId && byId.has(e.produtoSaidaId) ? byId.get(e.produtoSaidaId)! : null;
    const produtos = ps ? [ps] : (e.estadoSaida ? vendaveis : []);
    return {
      nodeId: e.nodeId,
      sequencia: e.sequencia,
      nome: e.nome,
      centroTrabalho: e.centroTrabalho,
      estadoSaida: e.estadoSaida,
      fromEstado,
      isPrimeira: fromEstado === null,
      produtoSaidaId: e.produtoSaidaId ?? null,
      produtos,
    };
  });

  return NextResponse.json({ areas, produtos: vendaveis });
}
