export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { Prisma, StatusEtapaOP, StatusOrdemProducao } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateLocalProducao, getOrCreateWipItem, getOrCreateLoteProducao, postMovimento } from "@/lib/pcp/wip-estoque";
import { contabilizarProducaoOrdem } from "@/lib/contabilidade";

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

    const ordem = await tx.ordemProducao.findUnique({
      where: { id: params.id },
      select: {
        status: true,
        numero: true,
        itemId: true,
        item: { select: { codigo: true, descricao: true } },
        fluxoVersao: { select: { fluxo: { select: { nome: true } } } },
      },
    });
    if (!ordem || ordem.status === "CANCELADA") return;

    const etapas = await tx.itemOrdemProducao.findMany({
      where: { ordemProducaoId: params.id },
      select: { status: true, estadoSaida: true, sequencia: true },
      orderBy: { sequencia: "asc" },
    });

    // ── Movimentação de WIP no estoque (baixa do estágio anterior + entrada no próximo) ──
    if (concluindoAgora && etapa.estadoSaida && qtdSaidaNum != null && qtdSaidaNum > 0) {
      const base = ordem.item
        ? { codigo: ordem.item.codigo, descricao: ordem.item.descricao }
        : { codigo: ordem.numero, descricao: ordem.fluxoVersao?.fluxo?.nome ?? ordem.numero };
      const localId = await getOrCreateLocalProducao(tx);
      const toEstado = etapa.estadoSaida;
      const anteriores = etapas.filter((e) => e.sequencia < etapa.sequencia && e.estadoSaida);
      const fromEstado = anteriores.length ? anteriores[anteriores.length - 1].estadoSaida : null;
      const loteId = await getOrCreateLoteProducao(tx, ordem.numero, `Produção ${ordem.numero} — ${etapa.nome}`);

      // Destino: item acabado real (se houver) quando ACABADO; senão item de WIP do estado.
      const destItemId =
        toEstado === "ACABADO" && ordem.itemId ? ordem.itemId : await getOrCreateWipItem(tx, base, toEstado);

      if (fromEstado) {
        const srcItemId = await getOrCreateWipItem(tx, base, fromEstado);
        await postMovimento(tx, {
          itemId: srcItemId,
          localEstoqueId: localId,
          tipo: "SAIDA",
          quantidade: qtdEntradaNum ?? qtdSaidaNum,
          ordemProducaoId: params.id,
          documento: ordem.numero,
          observacoes: `Consumo WIP ${fromEstado} — ${etapa.nome}`,
          loteId,
        });
      }
      await postMovimento(tx, {
        itemId: destItemId,
        localEstoqueId: localId,
        tipo: "ENTRADA",
        quantidade: qtdSaidaNum,
        ordemProducaoId: params.id,
        documento: ordem.numero,
        observacoes: `Produção ${toEstado} — ${etapa.nome}`,
        loteId,
      });
    }

    // ── Subproduto/resíduo gerado pela etapa → entrada no estoque (volta como insumo) ──
    const subQtd = numOrNull(body.subprodutoQtd);
    if (concluindoAgora && etapa.subprodutoItemId && subQtd != null && subQtd > 0) {
      const localId = await getOrCreateLocalProducao(tx);
      const loteId = await getOrCreateLoteProducao(tx, ordem.numero, `Subproduto ${etapa.nome} — ${ordem.numero}`);
      await postMovimento(tx, {
        itemId: etapa.subprodutoItemId,
        localEstoqueId: localId,
        tipo: "ENTRADA",
        quantidade: subQtd,
        ordemProducaoId: params.id,
        documento: ordem.numero,
        observacoes: `Subproduto/resíduo de ${etapa.nome}`,
        loteId,
      });
    }

    // ── Recalcula status/estado da ordem ──
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

  // Contabiliza a produção (D Estoque / C Custo de Produção) quando a ordem
  // conclui. Best-effort, pós-commit — não bloqueia o apontamento.
  await contabilizarProducaoOrdem(params.id).catch(() => {});

  return NextResponse.json({ ok: true });
}
