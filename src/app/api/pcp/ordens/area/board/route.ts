export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// GET /api/pcp/ordens/area/board?fluxoId=&areaNodeId=&data=YYYY-MM-DD
// OPs de UMA área criadas no dia (board de chão de fábrica). Uma OP por área tem
// uma única etapa com nodeId = areaNodeId.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const sp = new URL(req.url).searchParams;
  const fluxoId = sp.get("fluxoId") ?? "";
  const areaNodeId = sp.get("areaNodeId") ?? "";
  // Modo dia único (?data=) OU intervalo (?from=&to=, p/ a visão em lista agrupada).
  const data = sp.get("data") ?? new Date().toISOString().slice(0, 10);
  const from = sp.get("from");
  const to = sp.get("to");
  if (!fluxoId || !areaNodeId) return NextResponse.json({ error: "fluxoId e areaNodeId são obrigatórios" }, { status: 400 });

  const ini = new Date(`${from || data}T00:00:00.000Z`);
  const fim = new Date(`${to || data}T23:59:59.999Z`);
  if (isNaN(ini.getTime()) || isNaN(fim.getTime())) return NextResponse.json({ error: "Data inválida" }, { status: 400 });

  const ordens = await prisma.ordemProducao.findMany({
    where: {
      status: { not: "CANCELADA" },
      // Dia = dia PROGRAMADO (dataPrevistaInicio), não a emissão (createdAt). OPs
      // antigas sem programação caem no createdAt.
      OR: [
        { dataPrevistaInicio: { gte: ini, lte: fim } },
        { dataPrevistaInicio: null, createdAt: { gte: ini, lte: fim } },
      ],
      fluxoVersao: { fluxoProducaoId: fluxoId },
      etapas: { some: { nodeId: areaNodeId } },
    },
    orderBy: [{ dataPrevistaInicio: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, numero: true, status: true, quantidadePlanejada: true, unidade: true, criadoPor: true, createdAt: true,
      dataPrevistaInicio: true, dataPrevistaFim: true, observacao: true, responsavelColaboradorId: true, planoTransporte: true,
      responsavelColaborador: { select: { nome: true } },
      equipe: { select: { colaborador: { select: { id: true, nome: true } } } },
      item: { select: { codigo: true, descricao: true } },
      produtoItens: {
        select: { itemId: true, quantidadePlanejada: true, quantidadeReal: true, qtdPerda: true, unidadeId: true,
          item: { select: { codigo: true, descricao: true, itemUnidades: { select: { unidadeId: true, isPrincipal: true, fatorConversao: true, unidade: { select: { sigla: true } } } } } },
          unidade: { select: { sigla: true } } },
      },
      etapas: { where: { nodeId: areaNodeId }, select: { status: true, qtdSaida: true, qtdPerda: true, vagoes: true, vagonetas: true }, take: 1 },
    },
  });

  const data_ = ordens.map((o) => ({
    id: o.id,
    numero: o.numero,
    status: o.status,
    dia: (o.dataPrevistaInicio ?? o.createdAt).toISOString().slice(0, 10), // dia PROGRAMADO p/ agrupar
    quantidade: o.quantidadePlanejada,
    unidade: o.unidade,
    produto: o.item?.descricao ?? null,
    produtoCodigo: o.item?.codigo ?? null,
    criadoPor: o.criadoPor ?? null,
    responsavel: o.responsavelColaborador?.nome ?? null,
    responsavelColaboradorId: o.responsavelColaboradorId ?? null,
    equipe: o.equipe.map((e) => ({ id: e.colaborador.id, nome: e.colaborador.nome })),
    observacao: o.observacao ?? null,
    planoTransporte: o.planoTransporte ?? null,
    inicioPrevisto: o.dataPrevistaInicio,
    fimPrevisto: o.dataPrevistaFim,
    produtos: o.produtoItens.map((pi) => {
      // Peças (unidade-base) por 1 unidade apontada: PLT → peças/palete; principal → 1.
      // A UI usa p/ converter o apontado (ex.: paletes) em peças no cálculo de perda.
      let pecasPorUnidade = 1;
      if (pi.unidadeId) {
        const iu = pi.item.itemUnidades.find((u) => u.unidadeId === pi.unidadeId);
        if (iu && !iu.isPrincipal && iu.fatorConversao != null) {
          const f = Number(iu.fatorConversao);
          if (Number.isFinite(f) && f > 0) pecasPorUnidade = f;
        }
      }
      // Peças por PALETE (fator da unidade PLT do item, se cadastrada) — a UI usa
      // no apontamento "por palete" (nº paletes × pç/palete → quantidade real).
      const iuPlt = pi.item.itemUnidades.find((u) => /^PLT$/i.test(u.unidade?.sigla ?? "") && u.fatorConversao != null && Number(u.fatorConversao) > 0);
      const pecasPorPalete = iuPlt ? Number(iuPlt.fatorConversao) : null;
      return {
        itemId: pi.itemId,
        codigo: pi.item.codigo,
        descricao: pi.item.descricao,
        planejada: pi.quantidadePlanejada,
        real: pi.quantidadeReal,
        perda: pi.qtdPerda, // perda apontada por produto (peças) — p/ corrigir apontamento na edição
        unidade: pi.unidade?.sigla ?? null,
        unidadeId: pi.unidadeId ?? null,
        pecasPorUnidade,
        pecasPorPalete,
      };
    }),
    etapaStatus: o.etapas[0]?.status ?? "PENDENTE",
    qtdSaida: o.etapas[0]?.qtdSaida ?? null,
    qtdPerda: o.etapas[0]?.qtdPerda ?? null,
    vagoes: o.etapas[0]?.vagoes ?? null,
    vagonetas: o.etapas[0]?.vagonetas ?? null,
  }));

  return NextResponse.json({ data: data_ });
}
