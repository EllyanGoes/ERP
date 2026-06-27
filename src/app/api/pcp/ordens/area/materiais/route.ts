export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { snapshotEtapas } from "@/lib/pcp/snapshot-etapas";
import type { FlowGraph } from "@/lib/pcp/types";
import { LOCAL_EMBALAGEM_PRODUCAO_NOME } from "@/lib/pcp/wip-estoque";

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
  const produtoSaidaId = area.produtoSaidaId ?? null;

  // Escopo dos insumos:
  //  - Área com PRODUTO de saída (ex.: Preparação→Mistura de Argila): toda a BOM
  //    desse produto (sem filtro de fase) — não traz insumos de outros produtos.
  //  - Área de WIP: insumos da fase, só dos produtos VENDÁVEIS (tijolos).
  const engs = await prisma.engenhariaProduto.findMany({
    where: produtoSaidaId ? { itemId: produtoSaidaId } : { fluxoId, ativo: true, item: { vendavel: true } },
    include: {
      insumos: {
        include: { insumoItem: { select: { id: true, descricao: true, unidadeMedida: true, categoriaEstoque: true, unidade: { select: { sigla: true } } } } },
      },
    },
  });

  type Mat = { itemId: string; descricao: string; unidade: string | null; embalagem: boolean; consumoMin: number; consumoMax: number };
  const byItem = new Map<string, Mat>();
  for (const e of engs) {
    for (const ins of e.insumos) {
      if (!produtoSaidaId && (ins.estadoConsumo ?? null) !== fase) continue;
      if (!ins.insumoItem) continue;
      const q = Number(ins.quantidade) * (ins.base === "POR_UNIDADE" ? 1000 : 1); // por milheiro
      const cur = byItem.get(ins.insumoItemId);
      if (cur) { cur.consumoMin = Math.min(cur.consumoMin, q); cur.consumoMax = Math.max(cur.consumoMax, q); }
      else byItem.set(ins.insumoItemId, { itemId: ins.insumoItemId, descricao: ins.insumoItem.descricao, unidade: ins.insumoItem.unidade?.sigla ?? ins.insumoItem.unidadeMedida ?? null, embalagem: ins.insumoItem.categoriaEstoque === "EMBALAGEM", consumoMin: q, consumoMax: q });
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

  // Local de embalagem da PRODUÇÃO: mesmo zerado, aparece nas linhas de embalagem
  // (é de lá que a OP de Embalar consome) p/ a produção ver o que foi liberado.
  const localEmbProd = await prisma.localEstoque.findFirst({ where: { nome: LOCAL_EMBALAGEM_PRODUCAO_NOME }, select: { id: true, nome: true } });

  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const data = ids.map((id) => {
    const m = byItem.get(id)!;
    const todas = estoques.filter((e) => e.itemId === id);
    const porLocal = todas
      .map((e) => ({ localEstoqueId: e.localEstoqueId, localNome: e.localEstoqueId ? (nomeLocal.get(e.localEstoqueId) ?? "—") : "Sem local", saldo: r3(Number(e._sum.quantidadeAtual ?? 0)) }))
      .filter((l) => Math.abs(l.saldo) > 0.0005)
      .sort((a, b) => b.saldo - a.saldo);
    // Garante a linha do estoque de produção p/ embalagem (mesmo 0), se ainda não está.
    if (m.embalagem && localEmbProd && !porLocal.some((l) => l.localEstoqueId === localEmbProd.id)) {
      const saldoProd = r3(Number(todas.find((e) => e.localEstoqueId === localEmbProd.id)?._sum.quantidadeAtual ?? 0));
      porLocal.push({ localEstoqueId: localEmbProd.id, localNome: localEmbProd.nome, saldo: saldoProd });
    }
    return {
      itemId: id,
      descricao: m.descricao,
      unidade: m.unidade,
      saldoTotal: r3(porLocal.reduce((s, l) => s + l.saldo, 0)),
      locais: porLocal.map(({ localNome, saldo }) => ({ localNome, saldo })),
      consumoPorMilheiro: m.consumoMin === m.consumoMax ? r3(m.consumoMin) : null,
    };
  });

  return NextResponse.json({ data });
}
