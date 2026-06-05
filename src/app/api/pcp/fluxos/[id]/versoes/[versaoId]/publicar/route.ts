export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validarFluxo } from "@/lib/pcp/fluxo-validate";
import type { FlowGraph } from "@/lib/pcp/types";

// POST — valida e publica uma versão. Erros de validação bloqueiam (400);
// avisos (warnings) não. Ao publicar: marca PUBLICADA, arquiva publicações
// anteriores do fluxo e define a versão ativa.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; versaoId: string } },
) {
  const body = (await req.json().catch(() => null)) as { publicadoPor?: unknown } | null;
  const publicadoPor =
    body && typeof body.publicadoPor === "string" && body.publicadoPor.trim() ? body.publicadoPor.trim() : null;

  const versao = await prisma.fluxoProducaoVersao.findUnique({ where: { id: params.versaoId } });
  if (!versao || versao.fluxoProducaoId !== params.id) {
    return NextResponse.json({ error: "Versão não encontrada" }, { status: 404 });
  }

  const resultado = validarFluxo((versao.grafo as unknown as FlowGraph) ?? { nodes: [], edges: [] });
  if (!resultado.ok) {
    return NextResponse.json(
      { error: "O fluxo tem erros e não pode ser publicado.", issues: resultado.issues },
      { status: 400 },
    );
  }

  await prisma.$transaction([
    // arquiva publicações anteriores deste fluxo
    prisma.fluxoProducaoVersao.updateMany({
      where: { fluxoProducaoId: params.id, status: "PUBLICADA", NOT: { id: params.versaoId } },
      data: { status: "ARQUIVADA" },
    }),
    prisma.fluxoProducaoVersao.update({
      where: { id: params.versaoId },
      data: { status: "PUBLICADA", publicadoEm: new Date(), publicadoPor },
    }),
    prisma.fluxoProducao.update({
      where: { id: params.id },
      data: { versaoAtivaId: params.versaoId },
    }),
  ]);

  return NextResponse.json({
    data: { versaoId: params.versaoId, status: "PUBLICADA" },
    issues: resultado.issues, // pode conter warnings informativos
    bottleneckNodeId: resultado.bottleneckNodeId,
  });
}
