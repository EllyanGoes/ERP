export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma, EstadoWIP } from "@prisma/client";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { contabilizarProducaoOrdem } from "@/lib/contabilidade";
import { apontarEtapaProducao, apontarMisturaCif, apontarProducaoProduto } from "@/lib/pcp/apontamento";
import { snapshotEtapas } from "@/lib/pcp/snapshot-etapas";
import type { FlowGraph } from "@/lib/pcp/types";

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// POST /api/pcp/ordens/[id]/concluir-area — aponta a OP de uma área (board). Conclui
// a etapa e produz CADA produto da OP com sua quantidade REAL (planejado×real). Caminhos:
// WIP-chain (loop por produto), produto sem WIP (Preparação) e CIF (Mistura de queima).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  // Real por produto: itens=[{itemId, quantidadeReal}] (na unidade da linha). Default = planejado.
  const realMap = new Map<string, number>();
  if (Array.isArray(body?.itens)) {
    for (const r of body!.itens as Record<string, unknown>[]) {
      const q = numOrNull(r?.quantidadeReal);
      if (typeof r?.itemId === "string" && q != null) realMap.set(r.itemId, q);
    }
  }
  const qtdLegado = numOrNull(body?.quantidadeProduzida); // compat single-product
  const qtdPerda = numOrNull(body?.qtdPerda);
  const biomassaKg = numOrNull(body?.biomassaKg);
  const apontadoPor = typeof body?.apontadoPor === "string" && body.apontadoPor.trim() ? body.apontadoPor.trim() : null;

  const ordem = await prisma.ordemProducao.findUnique({
    where: { id: params.id },
    select: {
      id: true, status: true, itemId: true,
      item: { select: { naturezaPadrao: { select: { destinoSugerido: true } } } },
      fluxoVersao: { select: { grafo: true } },
      produtoItens: {
        select: {
          id: true, itemId: true, quantidadePlanejada: true, unidadeId: true,
          item: { select: { codigo: true, descricao: true, itemUnidades: { select: { unidadeId: true, isPrincipal: true, fatorConversao: true } } } },
        },
      },
      etapas: { select: { id: true, status: true, estadoSaida: true, sequencia: true, nome: true, subprodutoItemId: true, nodeId: true }, orderBy: { sequencia: "asc" } },
    },
  });
  if (!ordem) return NextResponse.json({ error: "Ordem não encontrada" }, { status: 404 });
  if (ordem.status === "CANCELADA") return NextResponse.json({ error: "Ordem cancelada" }, { status: 400 });
  const etapa = ordem.etapas[0];
  if (!etapa) return NextResponse.json({ error: "Ordem sem etapa" }, { status: 400 });
  if (etapa.status === "CONCLUIDA") return NextResponse.json({ error: "Etapa já concluída." }, { status: 400 });

  // Produtos a produzir (qtd na unidade da linha → base pelo fator do ItemUnidade).
  const fatorBase = (pi: (typeof ordem.produtoItens)[number]) => {
    if (!pi.unidadeId) return 1;
    const iu = pi.item.itemUnidades.find((u) => u.unidadeId === pi.unidadeId);
    if (!iu || iu.isPrincipal || iu.fatorConversao == null) return 1;
    const f = Number(iu.fatorConversao);
    return Number.isFinite(f) && f > 0 ? f : 1;
  };
  type Prod = { piId: string | null; itemId: string; codigo: string; descricao: string; realLinha: number; qtdBase: number };
  const itensProd: Prod[] = ordem.produtoItens.length
    ? ordem.produtoItens.map((pi) => {
        const real = realMap.get(pi.itemId) ?? Number(pi.quantidadePlanejada);
        return { piId: pi.id, itemId: pi.itemId, codigo: pi.item.codigo, descricao: pi.item.descricao, realLinha: real, qtdBase: real * fatorBase(pi) };
      })
    : (ordem.itemId && qtdLegado ? [{ piId: null, itemId: ordem.itemId, codigo: "", descricao: "", realLinha: qtdLegado, qtdBase: qtdLegado }] : []);
  const ativos = itensProd.filter((p) => p.qtdBase > 0);
  if (!ativos.length) return NextResponse.json({ error: "Informe a quantidade produzida de ao menos um produto." }, { status: 400 });
  const totalBase = ativos.reduce((s, p) => s + p.qtdBase, 0);

  // Grava a quantidade real (na unidade da linha) por produto.
  for (const p of itensProd) if (p.piId) await prisma.ordemProducaoProdutoItem.update({ where: { id: p.piId }, data: { quantidadeReal: p.realLinha } }).catch(() => {});

  // ── CIF (sem WIP): Mistura de insumos para queima → CIF a Apropriar ──
  const ehCifSemWip = !etapa.estadoSaida && ordem.item?.naturezaPadrao?.destinoSugerido === "CIF";
  if (ehCifSemWip) {
    await prisma.$transaction(async (tx) => {
      await apontarMisturaCif(tx, { ordemId: params.id, etapaId: etapa.id, qtd: ativos[0].qtdBase, apontadoPor });
    }, { timeout: 30000 });
    return NextResponse.json({ ok: true, cif: true });
  }

  // Estados (entrada/1ª área) e produto de saída da operação, derivados do fluxo.
  const etapasFluxo = snapshotEtapas((ordem.fluxoVersao?.grafo as unknown as FlowGraph) ?? { nodes: [], edges: [] });
  const areaIdx = etapasFluxo.findIndex((e) => e.nodeId === etapa.nodeId);
  const anteriores = areaIdx >= 0 ? etapasFluxo.slice(0, areaIdx).filter((e) => e.estadoSaida) : [];
  const fromEstado = (anteriores.length ? anteriores[anteriores.length - 1].estadoSaida : null) as EstadoWIP | null;
  const firstEstado = (etapasFluxo.find((e) => e.estadoSaida)?.estadoSaida ?? null) as EstadoWIP | null;
  const produtoSaidaId = (areaIdx >= 0 ? etapasFluxo[areaIdx].produtoSaidaId : null) ?? null;

  // ── Produto sem WIP (ex.: Preparação → Mistura de Argila) ──
  if (!etapa.estadoSaida && produtoSaidaId) {
    await prisma.$transaction(async (tx) => {
      await apontarProducaoProduto(tx, { ordemId: params.id, etapaId: etapa.id, qtd: ativos[0].qtdBase, apontadoPor });
    }, { timeout: 30000 });
    await contabilizarProducaoOrdem(params.id).catch(() => {});
    return NextResponse.json({ ok: true, produto: true });
  }

  // ── WIP-chain: cada produto da OP consome seu WIP/MP e produz seu WIP/PA ──
  const agora = new Date();
  await prisma.$transaction(async (tx) => {
    let i = 0;
    for (const p of ativos) {
      const upd: Prisma.ItemOrdemProducaoUpdateInput = {
        status: "CONCLUIDA",
        qtdEntrada: totalBase, qtdSaida: totalBase,
        inicioReal: agora, fimReal: agora,
        ...(apontadoPor ? { apontadoPor } : {}),
        ...(qtdPerda != null ? { qtdPerda } : {}),
      };
      await apontarEtapaProducao(tx, {
        ordemId: params.id,
        etapa: { id: etapa.id, status: etapa.status, estadoSaida: etapa.estadoSaida, sequencia: etapa.sequencia, nome: etapa.nome, subprodutoItemId: etapa.subprodutoItemId },
        upd,
        concluindoAgora: true,
        qtdEntradaNum: p.qtdBase,
        qtdSaidaNum: p.qtdBase,
        biomassaKg: i === 0 && etapa.estadoSaida === "QUEIMADO" ? biomassaKg : null,
        biomassaDescricao: null,
        milheiros: p.qtdBase,
        subprodutoQtd: null,
        apontadoPor,
        fromEstadoOverride: fromEstado,
        firstEstadoOverride: firstEstado,
        produtoOverride: p.codigo ? { itemId: p.itemId, codigo: p.codigo, descricao: p.descricao } : null,
      });
      i += 1;
    }
  }, { timeout: 60000 });

  await contabilizarProducaoOrdem(params.id).catch(() => {});

  return NextResponse.json({ ok: true, produtos: ativos.length });
}
