export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { KindNo, EstadoWIP, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";
import { snapshotEtapas } from "@/lib/pcp/snapshot-etapas";
import type { FlowGraph } from "@/lib/pcp/types";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { notifyOpCriada } from "@/lib/notify-pcp";

// GET — lista de ordens de produção com progresso
export async function GET() {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const ordens = await prisma.ordemProducao.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      item: { select: { codigo: true, descricao: true } },
      fluxoVersao: { select: { versao: true, fluxo: { select: { nome: true } } } },
      etapas: { select: { status: true } },
    },
  });
  const data = ordens.map((o) => ({
    id: o.id,
    numero: o.numero,
    status: o.status,
    estadoAtual: o.estadoAtual,
    quantidadePlanejada: o.quantidadePlanejada,
    unidade: o.unidade,
    item: o.item,
    fluxoNome: o.fluxoVersao?.fluxo?.nome ?? null,
    fluxoVersao: o.fluxoVersao?.versao ?? null,
    totalEtapas: o.etapas.length,
    etapasConcluidas: o.etapas.filter((e) => e.status === "CONCLUIDA").length,
    createdAt: o.createdAt,
  }));
  return NextResponse.json({ data, source: "db" });
}

// POST — cria OP a partir da versão PUBLICADA de um fluxo (snapshot das etapas)
export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const fluxoId = typeof body.fluxoId === "string" ? body.fluxoId : "";
  const quantidadePlanejada = Number(body.quantidadePlanejada);
  if (!fluxoId) return NextResponse.json({ error: "fluxoId é obrigatório" }, { status: 400 });
  if (!Number.isFinite(quantidadePlanejada) || quantidadePlanejada <= 0) {
    return NextResponse.json({ error: "Quantidade planejada deve ser > 0" }, { status: 400 });
  }

  const fluxo = await prisma.fluxoProducao.findUnique({ where: { id: fluxoId } });
  if (!fluxo) return NextResponse.json({ error: "Fluxo não encontrado" }, { status: 404 });
  if (!fluxo.versaoAtivaId) {
    return NextResponse.json({ error: "Publique uma versão do fluxo antes de criar a ordem." }, { status: 400 });
  }

  const versao = await prisma.fluxoProducaoVersao.findUnique({ where: { id: fluxo.versaoAtivaId } });
  if (!versao) return NextResponse.json({ error: "Versão publicada não encontrada" }, { status: 404 });

  const etapas = snapshotEtapas((versao.grafo as unknown as FlowGraph) ?? { nodes: [], edges: [] });
  if (etapas.length === 0) {
    return NextResponse.json({ error: "O fluxo publicado não tem etapas de produção." }, { status: 400 });
  }

  // Unidade da OP: usa a enviada; senão a unidade PRINCIPAL do item (a que a tela
  // exibe). Nunca mais o default fixo "milheiro" — ele não refletia o produto.
  let unidade = typeof body.unidade === "string" && body.unidade.trim() ? body.unidade.trim() : null;
  if (!unidade && fluxo.itemId) {
    const un = await prisma.itemUnidade.findFirst({
      where: { itemId: fluxo.itemId, isPrincipal: true },
      select: { unidade: { select: { sigla: true } } },
    });
    unidade = un?.unidade?.sigla ?? null;
  }
  const observacao = typeof body.observacao === "string" && body.observacao.trim() ? body.observacao.trim() : null;
  const criadoPor = typeof body.criadoPor === "string" && body.criadoPor.trim() ? body.criadoPor.trim() : null;

  const ordem = await prisma.$transaction(async (tx) => {
    const seq = await tx.sequencia.upsert({
      where: { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "OP" } },
      update: { ultimo: { increment: 1 } },
      create: { prefixo: "OP", ultimo: 1 },
    });
    const numero = generateSimpleDocNumber("OP", seq.ultimo);
    return tx.ordemProducao.create({
      data: {
        numero,
        itemId: fluxo.itemId,
        fluxoVersaoId: versao.id,
        quantidadePlanejada,
        unidade,
        observacao,
        criadoPor,
        etapas: {
          create: etapas.map((e) => ({
            nodeId: e.nodeId,
            sequencia: e.sequencia,
            nome: e.nome,
            kind: e.kind as KindNo,
            centroTrabalho: e.centroTrabalho,
            estadoSaida: (e.estadoSaida as EstadoWIP | null) ?? null,
            tempoCicloHoras: e.tempoCicloHoras,
            subprodutoItemId: e.subprodutoItemId,
            subprodutoDescricao: e.subprodutoDescricao,
            insumos: e.insumos as unknown as Prisma.InputJsonValue,
          })),
        },
      },
      include: { etapas: true },
    });
  });

  // Notifica o grupo de PCP no Telegram (best-effort, pós-commit, não bloqueia).
  await notifyOpCriada(ordem.id).catch(() => {});

  return NextResponse.json({ data: ordem });
}
