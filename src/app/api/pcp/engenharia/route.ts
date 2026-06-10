export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// GET — lista de engenharias (produto → fluxo + nº de insumos)
export async function GET() {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const engs = await prisma.engenhariaProduto.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      item: { select: { id: true, codigo: true, descricao: true } },
      fluxo: { select: { id: true, nome: true } },
      _count: { select: { insumos: true } },
    },
  });
  const data = engs.map((e) => ({
    id: e.id,
    ativo: e.ativo,
    item: e.item,
    fluxo: e.fluxo,
    totalInsumos: e._count.insumos,
    updatedAt: e.updatedAt,
  }));
  return NextResponse.json({ data, source: "db" });
}

// POST — cria a engenharia de um produto (1 por produto), vinculada a um fluxo
export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const fluxoId = typeof body.fluxoId === "string" ? body.fluxoId : "";
  if (!itemId || !fluxoId) {
    return NextResponse.json({ error: "Produto e fluxo são obrigatórios" }, { status: 400 });
  }
  try {
    const eng = await prisma.engenhariaProduto.create({
      data: {
        itemId,
        fluxoId,
        observacao: typeof body.observacao === "string" ? body.observacao.trim() || null : null,
      },
    });
    return NextResponse.json({ data: eng });
  } catch {
    return NextResponse.json({ error: "Este produto já tem engenharia (ou dados inválidos)." }, { status: 400 });
  }
}
