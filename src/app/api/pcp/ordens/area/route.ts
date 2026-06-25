export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { KindNo, EstadoWIP, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateDocNumber } from "@/lib/utils";
import { snapshotEtapas } from "@/lib/pcp/snapshot-etapas";
import type { FlowGraph } from "@/lib/pcp/types";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";

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
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const quantidade = Number(body.quantidadePlanejada ?? body.quantidade);
  if (!fluxoId) return NextResponse.json({ error: "fluxoId é obrigatório" }, { status: 400 });
  if (!areaNodeId) return NextResponse.json({ error: "areaNodeId é obrigatório" }, { status: 400 });
  if (!itemId) return NextResponse.json({ error: "Informe o produto" }, { status: 400 });
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    return NextResponse.json({ error: "Quantidade deve ser > 0" }, { status: 400 });
  }

  const [fluxo, item] = await Promise.all([
    prisma.fluxoProducao.findUnique({ where: { id: fluxoId } }),
    prisma.item.findUnique({ where: { id: itemId }, select: { id: true, codigo: true, descricao: true } }),
  ]);
  if (!fluxo) return NextResponse.json({ error: "Fluxo não encontrado" }, { status: 404 });
  if (!fluxo.versaoAtivaId) return NextResponse.json({ error: "Publique uma versão do fluxo antes de criar a ordem." }, { status: 400 });
  if (!item) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

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
  const criadoPor = typeof body.criadoPor === "string" && body.criadoPor.trim() ? body.criadoPor.trim() : null;

  const ordem = await prisma.$transaction(async (tx) => {
    const seq = await tx.sequencia.upsert({
      where: { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "OP" } },
      update: { ultimo: { increment: 1 } },
      create: { prefixo: "OP", ultimo: 1 },
    });
    const numero = generateDocNumber("OP", seq.ultimo);
    return tx.ordemProducao.create({
      data: {
        numero,
        itemId: item.id,
        fluxoVersaoId: versao.id,
        quantidadePlanejada: quantidade,
        unidade,
        observacao,
        criadoPor,
        estadoAtual: fromEstado ?? toEstado ?? undefined,
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
