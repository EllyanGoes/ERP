export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { snapshotEtapas } from "@/lib/pcp/snapshot-etapas";
import type { FlowGraph } from "@/lib/pcp/types";

// GET /api/pcp/ordens/area/materiais?fluxoId=&areaNodeId=
// Materiais necessários na área, derivados da ENGENHARIA (BOM) dos produtos do fluxo:
// os insumos cuja FASE de consumo (estadoConsumo) é o estado de saída da área. Ex.:
// Conformação(ÚMIDO) → Argila; Embalar(ACABADO) → Fita. Mostra o saldo em estoque.
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
  if (!area) return NextResponse.json({ data: [] });
  const fase = area.estadoSaida ?? null; // estado que esta área produz = fase de consumo dos insumos

  // Insumos da BOM (de todos os produtos fabricáveis do fluxo) consumidos NESTA fase.
  const engs = await prisma.engenhariaProduto.findMany({
    where: { fluxoId, ativo: true },
    include: {
      insumos: {
        include: { insumoItem: { select: { id: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } } },
      },
    },
  });

  type Mat = { itemId: string; descricao: string; unidade: string | null; consumoMin: number; consumoMax: number };
  const byItem = new Map<string, Mat>();
  for (const e of engs) {
    for (const ins of e.insumos) {
      if ((ins.estadoConsumo ?? null) !== fase) continue;
      if (!ins.insumoItem) continue;
      const q = Number(ins.quantidade) * (ins.base === "POR_UNIDADE" ? 1000 : 1); // por milheiro
      const cur = byItem.get(ins.insumoItemId);
      if (cur) { cur.consumoMin = Math.min(cur.consumoMin, q); cur.consumoMax = Math.max(cur.consumoMax, q); }
      else byItem.set(ins.insumoItemId, { itemId: ins.insumoItemId, descricao: ins.insumoItem.descricao, unidade: ins.insumoItem.unidade?.sigla ?? ins.insumoItem.unidadeMedida ?? null, consumoMin: q, consumoMax: q });
    }
  }
  const ids = Array.from(byItem.keys());
  if (!ids.length) return NextResponse.json({ data: [] });

  // Saldo POR LOCAL de estoque (onde cada material está hoje).
  const estoques = await prisma.estoqueItem.groupBy({
    by: ["itemId", "localEstoqueId"],
    where: { itemId: { in: ids }, clienteDonoId: null },
    _sum: { quantidadeAtual: true },
  });
  const localIds = Array.from(new Set(estoques.map((e) => e.localEstoqueId).filter((x): x is string => !!x)));
  const locais = localIds.length
    ? await prisma.localEstoque.findMany({ where: { id: { in: localIds } }, select: { id: true, nome: true } })
    : [];
  const nomeLocal = new Map(locais.map((l) => [l.id, l.nome]));

  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const data = ids.map((id) => {
    const m = byItem.get(id)!;
    const porLocal = estoques
      .filter((e) => e.itemId === id)
      .map((e) => ({ localNome: e.localEstoqueId ? (nomeLocal.get(e.localEstoqueId) ?? "—") : "Sem local", saldo: r3(Number(e._sum.quantidadeAtual ?? 0)) }))
      .filter((l) => Math.abs(l.saldo) > 0.0005)
      .sort((a, b) => b.saldo - a.saldo);
    return {
      itemId: id,
      descricao: m.descricao,
      unidade: m.unidade,
      saldoTotal: r3(porLocal.reduce((s, l) => s + l.saldo, 0)),
      locais: porLocal,
      consumoPorMilheiro: m.consumoMin === m.consumoMax ? r3(m.consumoMin) : null,
    };
  });

  return NextResponse.json({ data });
}
