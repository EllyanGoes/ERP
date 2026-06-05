export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — fila de produção: etapas a executar (pendentes/em execução) de ordens
// liberadas/em produção, para serem direcionadas às operações (centros de trabalho).
export async function GET() {
  const etapas = await prisma.itemOrdemProducao.findMany({
    where: {
      status: { in: ["PENDENTE", "EM_EXECUCAO"] },
      ordemProducao: { status: { in: ["LIBERADA", "EM_PRODUCAO"] } },
    },
    orderBy: [{ sequencia: "asc" }],
    select: {
      id: true,
      nome: true,
      sequencia: true,
      status: true,
      centroTrabalho: true,
      estadoSaida: true,
      tempoCicloHoras: true,
      ordemProducao: {
        select: {
          id: true,
          numero: true,
          quantidadePlanejada: true,
          unidade: true,
          item: { select: { descricao: true } },
        },
      },
    },
  });

  const data = etapas.map((e) => ({
    id: e.id,
    nome: e.nome,
    sequencia: e.sequencia,
    status: e.status,
    centroTrabalho: e.centroTrabalho ?? "Sem centro definido",
    estadoSaida: e.estadoSaida,
    tempoCicloHoras: e.tempoCicloHoras,
    ordemId: e.ordemProducao.id,
    numero: e.ordemProducao.numero,
    produto: e.ordemProducao.item?.descricao ?? null,
    quantidade: e.ordemProducao.quantidadePlanejada,
    unidade: e.ordemProducao.unidade,
  }));

  return NextResponse.json({ data, source: "db" });
}
