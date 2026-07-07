export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { VeiculoMovimentacao } from "@prisma/client";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { snapshotEtapas } from "@/lib/pcp/snapshot-etapas";
import type { FlowGraph } from "@/lib/pcp/types";

// POST /api/pcp/ordens/area/movimentacao-prevista
// Body: { fluxoId, areaNodeId, produtos: [{ itemId, quantidade, unidadeId }] }
// Nº de veículos (vagoneta/vagão) p/ mover a produção desta etapa: para cada veículo
// configurado na etapa (EtapaVeiculo) e cada produto, ceil(peças / capacidade). A
// quantidade vira peças pelo fator da unidade (capacidade é em peças/base).
const VEIC_LABEL: Record<VeiculoMovimentacao, string> = { VAGONETA: "Vagoneta", VAGAO: "Vagão" };
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

type ItemUni = { unidadeId: string; isPrincipal: boolean; fatorConversao: unknown };
function fator(unidadeId: string | null, ius: ItemUni[]): number {
  if (!unidadeId) return 1;
  const iu = ius.find((u) => u.unidadeId === unidadeId);
  if (iu && !iu.isPrincipal && iu.fatorConversao != null) { const f = num(iu.fatorConversao); if (f > 0) return f; }
  return 1;
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as { fluxoId?: string; areaNodeId?: string; produtos?: unknown } | null;
  const fluxoId = body?.fluxoId ?? "";
  const areaNodeId = body?.areaNodeId ?? "";
  const linhas = Array.isArray(body?.produtos)
    ? (body!.produtos as Record<string, unknown>[]).map((p) => ({ itemId: typeof p.itemId === "string" ? p.itemId : "", quantidade: num(p.quantidade), unidadeId: typeof p.unidadeId === "string" && p.unidadeId ? p.unidadeId : null })).filter((p) => p.itemId && p.quantidade > 0)
    : [];
  if (!fluxoId || !areaNodeId || !linhas.length) return NextResponse.json({ data: [] });

  const fluxo = await prisma.fluxoProducao.findUnique({ where: { id: fluxoId }, select: { versaoAtivaId: true } });
  if (!fluxo?.versaoAtivaId) return NextResponse.json({ data: [] });
  const versao = await prisma.fluxoProducaoVersao.findUnique({ where: { id: fluxo.versaoAtivaId }, select: { grafo: true } });
  const etapas = snapshotEtapas((versao?.grafo as unknown as FlowGraph) ?? { nodes: [], edges: [] });
  const area = etapas.find((e) => e.nodeId === areaNodeId);
  if (!area) return NextResponse.json({ data: [] });

  const veiculos = (await prisma.etapaVeiculo.findMany({ where: { etapa: area.nome }, select: { veiculo: true } })).map((v) => v.veiculo);
  if (!veiculos.length) return NextResponse.json({ data: [] });

  const itemIds = Array.from(new Set(linhas.map((l) => l.itemId)));
  const [itens, cargas] = await Promise.all([
    prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, descricao: true, itemUnidades: { select: { unidadeId: true, isPrincipal: true, fatorConversao: true } } } }),
    prisma.itemCargaVeiculo.findMany({ where: { itemId: { in: itemIds }, veiculo: { in: veiculos } } }),
  ]);
  const byItem = new Map(itens.map((i) => [i.id, i]));
  const capDe = (itemId: string, veiculo: VeiculoMovimentacao) => cargas.find((c) => c.itemId === itemId && c.veiculo === veiculo)?.capacidade ?? 0;

  const data: { itemId: string; descricao: string; veiculo: string; nVeiculos: number; capacidade: number; pecas: number }[] = [];
  for (const l of linhas) {
    const it = byItem.get(l.itemId);
    if (!it) continue;
    // Peças são unidades: arredonda para cima (espelha o apontamento).
    const pecas = Math.ceil(l.quantidade * fator(l.unidadeId, it.itemUnidades));
    for (const veiculo of veiculos) {
      const cap = capDe(l.itemId, veiculo);
      if (cap <= 0) continue;
      data.push({ itemId: l.itemId, descricao: it.descricao, veiculo: VEIC_LABEL[veiculo], nVeiculos: Math.ceil(pecas / cap), capacidade: cap, pecas: Math.round(pecas) });
    }
  }
  return NextResponse.json({ data });
}
