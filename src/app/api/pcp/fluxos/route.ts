export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emptyGraph } from "@/lib/pcp/types";

// GET — lista de fluxos com contagem de versões e status da última versão
export async function GET() {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const fluxos = await prisma.fluxoProducao.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      item: { select: { id: true, codigo: true, descricao: true } },
      versoes: { orderBy: { versao: "desc" }, select: { id: true, versao: true, status: true, updatedAt: true } },
    },
  });
  const data = fluxos.map((f) => ({
    id: f.id,
    nome: f.nome,
    descricao: f.descricao,
    ativo: f.ativo,
    item: f.item,
    versaoAtivaId: f.versaoAtivaId,
    totalVersoes: f.versoes.length,
    ultimaVersao: f.versoes[0] ?? null,
    updatedAt: f.updatedAt,
  }));
  return NextResponse.json({ data, source: "db" });
}

// POST — cria fluxo + versão 1 (RASCUNHO). Aceita grafo inicial (semente) opcional.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!nome) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });

  const grafo = (body.grafo && typeof body.grafo === "object" ? body.grafo : emptyGraph()) as Prisma.InputJsonValue;

  const fluxo = await prisma.fluxoProducao.create({
    data: {
      nome,
      descricao: typeof body.descricao === "string" ? body.descricao.trim() || null : null,
      itemId: typeof body.itemId === "string" && body.itemId ? body.itemId : null,
      versoes: { create: { versao: 1, status: "RASCUNHO", grafo } },
    },
    include: { versoes: true },
  });
  return NextResponse.json({ data: fluxo });
}
