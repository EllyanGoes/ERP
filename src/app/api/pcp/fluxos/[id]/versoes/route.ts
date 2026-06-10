export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// POST — salva o grafo. Se a última versão for RASCUNHO, atualiza-a; caso contrário
// (publicada/arquivada), bifurca uma nova versão RASCUNHO. Mantém um único rascunho vivo.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as { grafo?: unknown } | null;
  const grafo = body?.grafo;
  if (!grafo || typeof grafo !== "object") {
    return NextResponse.json({ error: "Grafo inválido" }, { status: 400 });
  }

  const fluxo = await prisma.fluxoProducao.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!fluxo) return NextResponse.json({ error: "Fluxo não encontrado" }, { status: 404 });

  const ultima = await prisma.fluxoProducaoVersao.findFirst({
    where: { fluxoProducaoId: params.id },
    orderBy: { versao: "desc" },
  });

  const grafoJson = grafo as Prisma.InputJsonValue;
  let versao;
  if (ultima && ultima.status === "RASCUNHO") {
    versao = await prisma.fluxoProducaoVersao.update({
      where: { id: ultima.id },
      data: { grafo: grafoJson },
      select: { id: true, versao: true, status: true },
    });
  } else {
    versao = await prisma.fluxoProducaoVersao.create({
      data: {
        fluxoProducaoId: params.id,
        versao: (ultima?.versao ?? 0) + 1,
        status: "RASCUNHO",
        grafo: grafoJson,
      },
      select: { id: true, versao: true, status: true },
    });
  }
  return NextResponse.json({ data: versao });
}
