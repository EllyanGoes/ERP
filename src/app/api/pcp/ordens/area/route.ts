export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { KindNo, EstadoWIP, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";
import { snapshotEtapas } from "@/lib/pcp/snapshot-etapas";
import type { FlowGraph } from "@/lib/pcp/types";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { sanitizarPlanoTransporte } from "@/lib/pcp/plano-transporte";

// POST /api/pcp/ordens/area — cria uma OP de UMA ÁREA (board de chão de fábrica).
// A OP nasce com só a etapa da área escolhida e o PRODUTO informado; consome o WIP
// da área anterior (ou MP, se for a 1ª área) e gera o WIP/PA da sua. "Uma OP por área".
export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const fluxoId = typeof body.fluxoId === "string" ? body.fluxoId : "";
  const areaNodeId = typeof body.areaNodeId === "string" ? body.areaNodeId : "";
  if (!fluxoId) return NextResponse.json({ error: "fluxoId é obrigatório" }, { status: 400 });
  if (!areaNodeId) return NextResponse.json({ error: "areaNodeId é obrigatório" }, { status: 400 });

  // Produtos da OP: aceita produtos[] (multi) ou itemId+quantidade (compat).
  type LinhaIn = { itemId: string; quantidade: number; unidadeId: string | null };
  const brutos = Array.isArray(body.produtos)
    ? (body.produtos as Record<string, unknown>[])
    : [{ itemId: body.itemId, quantidade: body.quantidadePlanejada ?? body.quantidade, unidadeId: body.unidadeId }];
  const produtos: LinhaIn[] = brutos
    .map((p) => ({ itemId: typeof p.itemId === "string" ? p.itemId : "", quantidade: Number(p.quantidade), unidadeId: typeof p.unidadeId === "string" && p.unidadeId ? p.unidadeId : null }))
    .filter((p) => p.itemId && Number.isFinite(p.quantidade) && p.quantidade > 0);
  if (produtos.length === 0) return NextResponse.json({ error: "Informe ao menos um produto com quantidade > 0." }, { status: 400 });

  const fluxo = await prisma.fluxoProducao.findUnique({ where: { id: fluxoId } });
  if (!fluxo) return NextResponse.json({ error: "Fluxo não encontrado" }, { status: 404 });
  if (!fluxo.versaoAtivaId) return NextResponse.json({ error: "Publique uma versão do fluxo antes de criar a ordem." }, { status: 400 });
  const itensOk = await prisma.item.findMany({ where: { id: { in: produtos.map((p) => p.itemId) } }, select: { id: true } });
  if (itensOk.length !== new Set(produtos.map((p) => p.itemId)).size) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

  const versao = await prisma.fluxoProducaoVersao.findUnique({ where: { id: fluxo.versaoAtivaId } });
  if (!versao) return NextResponse.json({ error: "Versão publicada não encontrada" }, { status: 404 });

  const etapas = snapshotEtapas((versao.grafo as unknown as FlowGraph) ?? { nodes: [], edges: [] });
  const area = etapas.find((e) => e.nodeId === areaNodeId);
  if (!area) return NextResponse.json({ error: "Área não encontrada no fluxo" }, { status: 404 });

  // Estado de saída desta área e de entrada (WIP da área anterior, na ordem do fluxo).
  const toEstado = (area.estadoSaida as EstadoWIP | null) ?? null;
  const anteriores = etapas.filter((e) => e.sequencia < area.sequencia && e.estadoSaida);
  const fromEstado = (anteriores.length ? anteriores[anteriores.length - 1].estadoSaida : null) as EstadoWIP | null;

  const unidade = typeof body.unidade === "string" && body.unidade.trim() ? body.unidade.trim() : "milheiro";
  const observacao = typeof body.observacao === "string" && body.observacao.trim() ? body.observacao.trim() : null;
  const criadoPor = auth.session.nome ?? null; // "Programado por" = usuário que emite a OP
  const parseDt = (v: unknown) => { if (typeof v === "string" && v.trim()) { const d = new Date(v); return isNaN(d.getTime()) ? null : d; } return null; };
  const dataPrevista = parseDt(body.dataPrevista);
  const dataPrevistaInicio = parseDt(body.dataPrevistaInicio);
  const dataPrevistaFim = parseDt(body.dataPrevistaFim);
  const responsavelColaboradorId = typeof body.responsavelColaboradorId === "string" && body.responsavelColaboradorId ? body.responsavelColaboradorId : null;
  // Equipe do dia: colaboradores que estavam na produção (a OP é do DIA, com
  // todas as pessoas — não uma OP por pessoa). O responsável fica no campo próprio.
  const equipeIds = Array.isArray(body.equipeIds)
    ? Array.from(new Set((body.equipeIds as unknown[]).filter((v): v is string => typeof v === "string" && !!v)))
    : [];
  // Config do "Planejar por transporte" (vagões) — persiste p/ reabrir/imprimir.
  const planoTransporte = sanitizarPlanoTransporte(body.planoTransporte);

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
        itemId: produtos[0].itemId, // compat: 1º produto
        fluxoVersaoId: versao.id,
        quantidadePlanejada: produtos[0].quantidade,
        unidade,
        observacao,
        criadoPor,
        dataPrevista,
        dataPrevistaInicio,
        dataPrevistaFim,
        responsavelColaboradorId,
        planoTransporte: planoTransporte === null ? undefined : (planoTransporte as unknown as Prisma.InputJsonValue),
        estadoAtual: fromEstado ?? toEstado ?? undefined,
        produtoItens: {
          create: produtos.map((p) => ({ itemId: p.itemId, quantidadePlanejada: p.quantidade, unidadeId: p.unidadeId })),
        },
        ...(equipeIds.length ? { equipe: { create: equipeIds.map((colaboradorId) => ({ colaboradorId })) } } : {}),
        etapas: {
          create: [{
            nodeId: area.nodeId,
            sequencia: area.sequencia,
            nome: area.nome,
            kind: area.kind as KindNo,
            centroTrabalho: area.centroTrabalho,
            estadoSaida: toEstado,
            tempoCicloHoras: area.tempoCicloHoras,
            subprodutoItemId: area.subprodutoItemId,
            subprodutoDescricao: area.subprodutoDescricao,
            insumos: area.insumos as unknown as Prisma.InputJsonValue,
          }],
        },
      },
      include: { etapas: true },
    });
  });

  return NextResponse.json({ data: ordem });
}
