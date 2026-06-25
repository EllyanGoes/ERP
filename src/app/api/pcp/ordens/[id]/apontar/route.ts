export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { Prisma, StatusEtapaOP } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { contabilizarProducaoOrdem } from "@/lib/contabilidade";
import { apontarEtapaProducao } from "@/lib/pcp/apontamento";

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
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

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

  // Concluindo uma transição de estado agora? → dispara movimentação de WIP no estoque.
  const jaConcluida = etapa.status === "CONCLUIDA";
  const concluindoAgora = novoStatus === "CONCLUIDA" && !jaConcluida;
  const qtdSaidaNum = numOrNull(body.qtdSaida);
  const qtdEntradaNum = numOrNull(body.qtdEntrada);

  await prisma.$transaction(async (tx) => {
    await apontarEtapaProducao(tx, {
      ordemId: params.id,
      etapa: { id: etapa.id, status: etapa.status, estadoSaida: etapa.estadoSaida, sequencia: etapa.sequencia, nome: etapa.nome, subprodutoItemId: etapa.subprodutoItemId },
      upd,
      concluindoAgora,
      qtdEntradaNum,
      qtdSaidaNum,
      biomassaKg,
      biomassaDescricao: typeof body.biomassaDescricao === "string" ? body.biomassaDescricao.trim() || null : null,
      milheiros,
      subprodutoQtd: numOrNull(body.subprodutoQtd),
      apontadoPor,
    });
  });

  // Contabiliza a produção (D Estoque / C Custo de Produção) quando a ordem
  // conclui. Best-effort, pós-commit — não bloqueia o apontamento.
  await contabilizarProducaoOrdem(params.id).catch(() => {});

  return NextResponse.json({ ok: true });
}
