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
  const data = sp.get("data") ?? new Date().toISOString().slice(0, 10);
  if (!fluxoId || !areaNodeId) return NextResponse.json({ error: "fluxoId e areaNodeId são obrigatórios" }, { status: 400 });

  const ini = new Date(`${data}T00:00:00.000Z`);
  const fim = new Date(`${data}T23:59:59.999Z`);
  if (isNaN(ini.getTime())) return NextResponse.json({ error: "Data inválida" }, { status: 400 });

  const ordens = await prisma.ordemProducao.findMany({
    where: {
      status: { not: "CANCELADA" },
      createdAt: { gte: ini, lte: fim },
      fluxoVersao: { fluxoProducaoId: fluxoId },
      etapas: { some: { nodeId: areaNodeId } },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, numero: true, status: true, quantidadePlanejada: true, unidade: true, criadoPor: true,
      dataPrevistaInicio: true, dataPrevistaFim: true, observacao: true, responsavelColaboradorId: true,
      responsavelColaborador: { select: { nome: true } },
      item: { select: { codigo: true, descricao: true } },
      produtoItens: {
        select: { itemId: true, quantidadePlanejada: true, quantidadeReal: true, unidadeId: true,
          item: { select: { codigo: true, descricao: true } }, unidade: { select: { sigla: true } } },
      },
      etapas: { where: { nodeId: areaNodeId }, select: { status: true, qtdSaida: true, qtdPerda: true }, take: 1 },
    },
  });

  const data_ = ordens.map((o) => ({
    id: o.id,
    numero: o.numero,
    status: o.status,
    quantidade: o.quantidadePlanejada,
    unidade: o.unidade,
    produto: o.item?.descricao ?? null,
    produtoCodigo: o.item?.codigo ?? null,
    criadoPor: o.criadoPor ?? null,
    responsavel: o.responsavelColaborador?.nome ?? null,
    inicioPrevisto: o.dataPrevistaInicio,
    fimPrevisto: o.dataPrevistaFim,
    produtos: o.produtoItens.map((pi) => ({
      itemId: pi.itemId,
      codigo: pi.item.codigo,
      descricao: pi.item.descricao,
      planejada: pi.quantidadePlanejada,
      real: pi.quantidadeReal,
      unidade: pi.unidade?.sigla ?? null,
    })),
    etapaStatus: o.etapas[0]?.status ?? "PENDENTE",
    qtdSaida: o.etapas[0]?.qtdSaida ?? null,
    qtdPerda: o.etapas[0]?.qtdPerda ?? null,
  }));

  return NextResponse.json({ data: data_ });
}
