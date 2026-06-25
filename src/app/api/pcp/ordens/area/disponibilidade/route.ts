export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { snapshotEtapas } from "@/lib/pcp/snapshot-etapas";
import type { FlowGraph } from "@/lib/pcp/types";

// Replica o slug de wip-estoque.ts p/ resolver o item WIP por código (sem criar).
function slug(s: string): string {
  return (
    s.normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase().slice(0, 24) || "PROD"
  );
}
const baseFator = (b: string) => (b === "POR_UNIDADE" ? 1000 : 1);

// GET /api/pcp/ordens/area/disponibilidade?fluxoId=&areaNodeId=&itemId=
// Referência (NÃO trava): na 1ª área → quanto a MP rende (milheiros); demais → saldo
// de WIP da área anterior do mesmo produto.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const sp = new URL(req.url).searchParams;
  const fluxoId = sp.get("fluxoId") ?? "";
  const areaNodeId = sp.get("areaNodeId") ?? "";
  const itemId = sp.get("itemId") ?? "";
  if (!fluxoId || !areaNodeId || !itemId) return NextResponse.json({ error: "fluxoId, areaNodeId e itemId são obrigatórios" }, { status: 400 });

  const fluxo = await prisma.fluxoProducao.findUnique({ where: { id: fluxoId }, select: { versaoAtivaId: true } });
  if (!fluxo?.versaoAtivaId) return NextResponse.json({ error: "Fluxo sem versão publicada" }, { status: 400 });
  const versao = await prisma.fluxoProducaoVersao.findUnique({ where: { id: fluxo.versaoAtivaId }, select: { grafo: true } });
  const etapas = snapshotEtapas((versao?.grafo as unknown as FlowGraph) ?? { nodes: [], edges: [] });
  const areaIdx = etapas.findIndex((e) => e.nodeId === areaNodeId);
  if (areaIdx < 0) return NextResponse.json({ error: "Área não encontrada" }, { status: 404 });
  const anteriores = etapas.slice(0, areaIdx).filter((e) => e.estadoSaida);
  const fromEstado = anteriores.length ? anteriores[anteriores.length - 1].estadoSaida : null;

  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { codigo: true } });
  if (!item) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

  // ── Áreas seguintes: saldo do WIP da área anterior (mesmo produto) ──
  if (fromEstado) {
    const wipCodigo = `WIP-${slug(item.codigo)}-${fromEstado}`;
    const wipItem = await prisma.item.findUnique({ where: { codigo: wipCodigo }, select: { id: true } });
    let saldo = 0;
    if (wipItem) {
      const g = await prisma.estoqueItem.groupBy({ by: ["itemId"], where: { itemId: wipItem.id, clienteDonoId: null }, _sum: { quantidadeAtual: true } });
      saldo = Number(g[0]?._sum.quantidadeAtual ?? 0);
    }
    return NextResponse.json({ tipo: "WIP", fromEstado, saldoWipAnterior: Math.round(saldo * 1000) / 1000 });
  }

  // ── 1ª área: rendimento pela matéria-prima (BOM × estoque) ──
  const eng = await prisma.engenhariaProduto.findUnique({
    where: { itemId },
    include: {
      insumos: {
        include: {
          insumoItem: {
            select: { id: true, codigo: true, descricao: true, categoriaEstoque: true, compoeCusto: true,
              itemUnidades: { select: { unidadeId: true, isPrincipal: true, fatorConversao: true } } },
          },
        },
      },
    },
  });
  if (!eng) return NextResponse.json({ tipo: "MP", rendimentoMilheiros: null, insumos: [], aviso: "Produto sem engenharia (BOM)." });

  // Considera só insumos físicos estocáveis (limitam a produção); ignora água e energia/serviços.
  const ESTOCAVEIS = new Set(["MATERIA_PRIMA", "MISTURA", "EMBALAGEM"]);
  const linhas = eng.insumos.filter((i) => i.insumoItem && i.insumoItem.compoeCusto !== false && ESTOCAVEIS.has(i.categoria));
  const ids = Array.from(new Set(linhas.map((i) => i.insumoItemId)));
  const estoques = ids.length
    ? await prisma.estoqueItem.groupBy({ by: ["itemId"], where: { itemId: { in: ids }, clienteDonoId: null }, _sum: { quantidadeAtual: true } })
    : [];
  const disp = new Map(estoques.map((e) => [e.itemId, Number(e._sum.quantidadeAtual ?? 0)]));

  let rendimento: number | null = null;
  const insumos = linhas.map((ins) => {
    const meta = ins.insumoItem!;
    let fatorUnidade = 1;
    if (ins.unidadeId) {
      const iu = meta.itemUnidades.find((u) => u.unidadeId === ins.unidadeId);
      if (iu && !iu.isPrincipal && iu.fatorConversao != null) {
        const f = Number(iu.fatorConversao);
        if (Number.isFinite(f) && f > 0) fatorUnidade = f;
      }
    }
    const consumoPorMilheiro = Number(ins.quantidade) * fatorUnidade * baseFator(ins.base);
    const disponivel = disp.get(ins.insumoItemId) ?? 0;
    const rende = consumoPorMilheiro > 0 ? disponivel / consumoPorMilheiro : Infinity;
    if (consumoPorMilheiro > 0) rendimento = rendimento == null ? rende : Math.min(rendimento, rende);
    return {
      itemId: ins.insumoItemId, descricao: meta.descricao, categoria: ins.categoria,
      consumoPorMilheiro: Math.round(consumoPorMilheiro * 1000) / 1000,
      disponivel: Math.round(disponivel * 1000) / 1000,
    };
  });

  return NextResponse.json({
    tipo: "MP",
    rendimentoMilheiros: rendimento != null && Number.isFinite(rendimento) ? Math.round(rendimento * 100) / 100 : null,
    insumos,
  });
}
