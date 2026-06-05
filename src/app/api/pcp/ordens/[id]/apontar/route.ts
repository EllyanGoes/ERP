export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma, StatusEtapaOP, StatusOrdemProducao } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function intOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  return n != null ? Math.trunc(n) : null;
}

// POST — aponta uma etapa: quantidades, perdas, vagões, status + biomassa opcional.
// Recalcula status/estado da ordem.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const etapaId = typeof body.etapaId === "string" ? body.etapaId : "";
  if (!etapaId) return NextResponse.json({ error: "etapaId é obrigatório" }, { status: 400 });

  const etapa = await prisma.itemOrdemProducao.findUnique({ where: { id: etapaId } });
  if (!etapa || etapa.ordemProducaoId !== params.id) {
    return NextResponse.json({ error: "Etapa não encontrada nesta ordem" }, { status: 404 });
  }

  const apontadoPor = typeof body.apontadoPor === "string" && body.apontadoPor.trim() ? body.apontadoPor.trim() : null;
  const upd: Prisma.ItemOrdemProducaoUpdateInput = {};
  if ("qtdEntrada" in body) upd.qtdEntrada = numOrNull(body.qtdEntrada);
  if ("qtdSaida" in body) upd.qtdSaida = numOrNull(body.qtdSaida);
  if ("qtdPerda" in body) upd.qtdPerda = numOrNull(body.qtdPerda);
  if ("vagoes" in body) upd.vagoes = intOrNull(body.vagoes);
  if ("vagonetas" in body) upd.vagonetas = intOrNull(body.vagonetas);
  if ("observacao" in body) upd.observacao = typeof body.observacao === "string" ? body.observacao.trim() || null : null;
  if (apontadoPor) upd.apontadoPor = apontadoPor;

  const novoStatus = typeof body.status === "string" ? body.status : null;
  const agora = new Date();
  if (novoStatus === "EM_EXECUCAO") {
    upd.status = "EM_EXECUCAO" as StatusEtapaOP;
    if (!etapa.inicioReal) upd.inicioReal = agora;
  } else if (novoStatus === "CONCLUIDA") {
    upd.status = "CONCLUIDA" as StatusEtapaOP;
    upd.fimReal = agora;
    if (!etapa.inicioReal) upd.inicioReal = agora;
  } else if (novoStatus === "PENDENTE") {
    upd.status = "PENDENTE" as StatusEtapaOP;
  }

  const biomassaKg = numOrNull(body.biomassaKg);
  const milheiros = numOrNull(body.milheirosProduzidos);

  await prisma.$transaction(async (tx) => {
    await tx.itemOrdemProducao.update({ where: { id: etapaId }, data: upd });

    if (biomassaKg != null && biomassaKg > 0) {
      await tx.consumoBiomassa.create({
        data: {
          ordemProducaoId: params.id,
          itemOrdemProducaoId: etapaId,
          descricao: typeof body.biomassaDescricao === "string" ? body.biomassaDescricao.trim() || null : "Caroço de açaí",
          quantidadeKg: biomassaKg,
          milheirosProduzidos: milheiros,
          registradoPor: apontadoPor,
        },
      });
    }

    // Recalcula status/estado da ordem (sem mexer em ordens canceladas)
    const ordem = await tx.ordemProducao.findUnique({ where: { id: params.id }, select: { status: true } });
    if (!ordem || ordem.status === "CANCELADA") return;

    const etapas = await tx.itemOrdemProducao.findMany({
      where: { ordemProducaoId: params.id },
      select: { status: true, estadoSaida: true, sequencia: true },
      orderBy: { sequencia: "asc" },
    });
    const todasConcluidas = etapas.length > 0 && etapas.every((e) => e.status === "CONCLUIDA");
    const algumaIniciada = etapas.some((e) => e.status !== "PENDENTE");

    const opData: { status?: StatusOrdemProducao; estadoAtual?: NonNullable<typeof etapa.estadoSaida> } = {};
    if (todasConcluidas) opData.status = "CONCLUIDA";
    else if (algumaIniciada) opData.status = "EM_PRODUCAO";

    const concluidas = etapas.filter((e) => e.status === "CONCLUIDA");
    const ultima = concluidas[concluidas.length - 1];
    if (ultima?.estadoSaida) opData.estadoAtual = ultima.estadoSaida;

    if (Object.keys(opData).length) {
      await tx.ordemProducao.update({ where: { id: params.id }, data: opData });
    }
  });

  return NextResponse.json({ ok: true });
}
