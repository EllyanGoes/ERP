export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { VeiculoMovimentacao } from "@prisma/client";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { snapshotEtapas } from "@/lib/pcp/snapshot-etapas";
import type { FlowGraph } from "@/lib/pcp/types";

const VEICULOS: VeiculoMovimentacao[] = ["VAGONETA", "VAGAO"];

// Nomes distintos das etapas (operações) dos fluxos publicados.
async function etapasDosFluxos(): Promise<string[]> {
  const fluxos = await prisma.fluxoProducao.findMany({ where: { versaoAtivaId: { not: null } }, select: { versaoAtivaId: true } });
  const ids = fluxos.map((f) => f.versaoAtivaId!).filter(Boolean);
  const versoes = ids.length ? await prisma.fluxoProducaoVersao.findMany({ where: { id: { in: ids } }, select: { grafo: true } }) : [];
  const nomes = new Set<string>();
  for (const v of versoes) for (const e of snapshotEtapas((v.grafo as unknown as FlowGraph) ?? { nodes: [], edges: [] })) if (e.nome) nomes.add(e.nome);
  return Array.from(nomes).sort((a, b) => a.localeCompare(b));
}

// GET — config das cargas: etapas (c/ veículos) + produtos vendáveis (c/ capacidades).
export async function GET() {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const [etapas, engs, etapaVeic] = await Promise.all([
    etapasDosFluxos(),
    prisma.engenhariaProduto.findMany({
      where: { ativo: true, item: { vendavel: true } },
      select: { item: { select: { id: true, codigo: true, descricao: true } } },
    }),
    prisma.etapaVeiculo.findMany(),
  ]);

  const veicPorEtapa = new Map<string, VeiculoMovimentacao[]>();
  for (const ev of etapaVeic) veicPorEtapa.set(ev.etapa, [...(veicPorEtapa.get(ev.etapa) ?? []), ev.veiculo]);

  const produtosMap = new Map(engs.map((e) => e.item).filter((x): x is NonNullable<typeof x> => !!x).map((p) => [p.id, p]));
  const produtoIds = Array.from(produtosMap.keys());
  const cargas = produtoIds.length ? await prisma.itemCargaVeiculo.findMany({ where: { itemId: { in: produtoIds } } }) : [];
  const capPorItem = new Map<string, Record<string, number>>();
  for (const c of cargas) capPorItem.set(c.itemId, { ...(capPorItem.get(c.itemId) ?? {}), [c.veiculo]: c.capacidade });

  return NextResponse.json({
    veiculos: VEICULOS,
    etapas: etapas.map((etapa) => ({ etapa, veiculos: veicPorEtapa.get(etapa) ?? [] })),
    produtos: Array.from(produtosMap.values()).map((p) => ({
      itemId: p.id, codigo: p.codigo, descricao: p.descricao,
      capacidades: { VAGONETA: capPorItem.get(p.id)?.VAGONETA ?? null, VAGAO: capPorItem.get(p.id)?.VAGAO ?? null },
    })),
  });
}

// PUT — salva a config (substitui as linhas).
export async function PUT(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => null)) as {
    etapas?: { etapa: string; veiculos: VeiculoMovimentacao[] }[];
    produtos?: { itemId: string; capacidades: Record<string, unknown> }[];
  } | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const etapaRows = (body.etapas ?? []).flatMap((e) =>
    (e.veiculos ?? []).filter((v) => VEICULOS.includes(v)).map((veiculo) => ({ etapa: e.etapa, veiculo })));
  const cargaRows = (body.produtos ?? []).flatMap((p) =>
    VEICULOS.map((veiculo) => ({ itemId: p.itemId, veiculo, capacidade: Math.round(Number(p.capacidades?.[veiculo])) }))
      .filter((r) => Number.isFinite(r.capacidade) && r.capacidade > 0));

  await prisma.$transaction(async (tx) => {
    await tx.etapaVeiculo.deleteMany({});
    if (etapaRows.length) await tx.etapaVeiculo.createMany({ data: etapaRows, skipDuplicates: true });
    await tx.itemCargaVeiculo.deleteMany({});
    for (const r of cargaRows) await tx.itemCargaVeiculo.create({ data: r });
  });

  return NextResponse.json({ ok: true });
}
