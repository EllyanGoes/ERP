export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma, EstadoWIP } from "@prisma/client";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { contabilizarProducaoOrdem } from "@/lib/contabilidade";
import { apontarEtapaProducao, apontarMisturaCif } from "@/lib/pcp/apontamento";
import { snapshotEtapas } from "@/lib/pcp/snapshot-etapas";
import type { FlowGraph } from "@/lib/pcp/types";

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// POST /api/pcp/ordens/[id]/concluir-area — aponta uma OP de uma ÁREA (board).
// Conclui a única etapa da OP com a quantidade produzida: consome o WIP da área
// anterior (fromEstado, derivado do fluxo) + a MP se for a 1ª área (firstEstado) e
// gera o WIP/PA desta área. Reusa o motor apontarEtapaProducao com os overrides.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const quantidadeProduzida = numOrNull(body?.quantidadeProduzida);
  if (!quantidadeProduzida || quantidadeProduzida <= 0) {
    return NextResponse.json({ error: "Informe a quantidade produzida (> 0)." }, { status: 400 });
  }
  const qtdPerda = numOrNull(body?.qtdPerda);
  const biomassaKg = numOrNull(body?.biomassaKg);
  const apontadoPor = typeof body?.apontadoPor === "string" && body.apontadoPor.trim() ? body.apontadoPor.trim() : null;

  const ordem = await prisma.ordemProducao.findUnique({
    where: { id: params.id },
    select: {
      id: true, status: true,
      item: { select: { naturezaPadrao: { select: { destinoSugerido: true } } } },
      fluxoVersao: { select: { grafo: true } },
      etapas: {
        select: { id: true, status: true, estadoSaida: true, sequencia: true, nome: true, subprodutoItemId: true, nodeId: true },
        orderBy: { sequencia: "asc" },
      },
    },
  });
  if (!ordem) return NextResponse.json({ error: "Ordem não encontrada" }, { status: 404 });
  if (ordem.status === "CANCELADA") return NextResponse.json({ error: "Ordem cancelada" }, { status: 400 });
  const etapa = ordem.etapas[0];
  if (!etapa) return NextResponse.json({ error: "Ordem sem etapa" }, { status: 400 });
  if (etapa.status === "CONCLUIDA") return NextResponse.json({ error: "Etapa já concluída." }, { status: 400 });

  // OP de área CIF (sem WIP) — ex.: "Mistura de insumos para queima": consome a
  // serragem do estoque e lança direto em CIF a Apropriar, sem gerar WIP/PA.
  // Gatilho: o produto da OP tem naturezaPadrao com destinoSugerido = CIF.
  const ehCifSemWip = !etapa.estadoSaida && ordem.item?.naturezaPadrao?.destinoSugerido === "CIF";
  if (ehCifSemWip) {
    await prisma.$transaction(async (tx) => {
      await apontarMisturaCif(tx, { ordemId: params.id, etapaId: etapa.id, qtd: quantidadeProduzida, apontadoPor });
    }, { timeout: 30000 });
    return NextResponse.json({ ok: true, cif: true });
  }

  // Deriva os estados de entrada (WIP anterior) e da 1ª área do fluxo a partir do grafo.
  const etapasFluxo = snapshotEtapas((ordem.fluxoVersao?.grafo as unknown as FlowGraph) ?? { nodes: [], edges: [] });
  const areaIdx = etapasFluxo.findIndex((e) => e.nodeId === etapa.nodeId);
  const anteriores = areaIdx >= 0 ? etapasFluxo.slice(0, areaIdx).filter((e) => e.estadoSaida) : [];
  const fromEstado = (anteriores.length ? anteriores[anteriores.length - 1].estadoSaida : null) as EstadoWIP | null;
  const firstEstado = (etapasFluxo.find((e) => e.estadoSaida)?.estadoSaida ?? null) as EstadoWIP | null;

  const agora = new Date();
  const upd: Prisma.ItemOrdemProducaoUpdateInput = {
    status: "CONCLUIDA",
    qtdEntrada: quantidadeProduzida,
    qtdSaida: quantidadeProduzida,
    inicioReal: agora,
    fimReal: agora,
    ...(apontadoPor ? { apontadoPor } : {}),
    ...(qtdPerda != null ? { qtdPerda } : {}),
  };

  await prisma.$transaction(async (tx) => {
    await apontarEtapaProducao(tx, {
      ordemId: params.id,
      etapa: { id: etapa.id, status: etapa.status, estadoSaida: etapa.estadoSaida, sequencia: etapa.sequencia, nome: etapa.nome, subprodutoItemId: etapa.subprodutoItemId },
      upd,
      concluindoAgora: true,
      qtdEntradaNum: quantidadeProduzida,
      qtdSaidaNum: quantidadeProduzida,
      biomassaKg: etapa.estadoSaida === "QUEIMADO" ? biomassaKg : null,
      biomassaDescricao: null,
      milheiros: quantidadeProduzida,
      subprodutoQtd: null,
      apontadoPor,
      fromEstadoOverride: fromEstado,
      firstEstadoOverride: firstEstado,
    });
  }, { timeout: 30000 });

  await contabilizarProducaoOrdem(params.id).catch(() => {});

  return NextResponse.json({ ok: true });
}
