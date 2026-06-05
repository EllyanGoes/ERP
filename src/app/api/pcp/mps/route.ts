export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { OrigemDemanda } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ORIGENS: OrigemDemanda[] = ["MANUAL", "PEDIDO_VENDA", "MIN_MAX"];

// GET — linhas do plano mestre (com produto)
export async function GET(req: NextRequest) {
  const periodo = req.nextUrl.searchParams.get("periodo") || undefined;
  const planos = await prisma.planoMestre.findMany({
    where: periodo ? { periodo } : undefined,
    orderBy: [{ periodo: "desc" }, { createdAt: "asc" }],
    include: { item: { select: { id: true, codigo: true, descricao: true } } },
  });
  return NextResponse.json({ data: planos, source: "db" });
}

// POST — adiciona uma linha de demanda planejada (manual por padrão)
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const periodo = typeof body.periodo === "string" ? body.periodo.trim() : "";
  const quantidade = Number(body.quantidade);
  if (!itemId || !/^\d{4}-\d{2}$/.test(periodo)) {
    return NextResponse.json({ error: "Produto e período (AAAA-MM) são obrigatórios" }, { status: 400 });
  }
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    return NextResponse.json({ error: "Quantidade deve ser > 0" }, { status: 400 });
  }
  const origem = (ORIGENS as string[]).includes(String(body.origem)) ? (body.origem as OrigemDemanda) : "MANUAL";

  try {
    const plano = await prisma.planoMestre.create({
      data: {
        itemId,
        periodo,
        quantidade,
        origem,
        observacao: typeof body.observacao === "string" ? body.observacao.trim() || null : null,
      },
      include: { item: { select: { id: true, codigo: true, descricao: true } } },
    });
    return NextResponse.json({ data: plano });
  } catch {
    return NextResponse.json({ error: "Não foi possível criar (produto inválido?)." }, { status: 400 });
  }
}
