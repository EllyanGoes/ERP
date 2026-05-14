export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Ctx = { params: { id: string } };

// GET — list conversions for a unit
export async function GET(_req: NextRequest, { params }: Ctx) {
  const conversoes = await prisma.unidadeConversao.findMany({
    where: { unidadeOrigemId: params.id },
    include: {
      unidadeDestino: { select: { id: true, sigla: true, nome: true } },
    },
    orderBy: { unidadeDestino: { sigla: "asc" } },
  });
  return NextResponse.json(conversoes);
}

const postSchema = z.object({
  unidadeDestinoId: z.string().min(1),
  fator: z.coerce.number().positive(),
});

// POST — create conversion
export async function POST(req: NextRequest, { params }: Ctx) {
  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  if (parsed.data.unidadeDestinoId === params.id)
    return NextResponse.json({ error: "A unidade de destino não pode ser igual à de origem." }, { status: 422 });

  try {
    const created = await prisma.unidadeConversao.create({
      data: {
        unidadeOrigemId:  params.id,
        unidadeDestinoId: parsed.data.unidadeDestinoId,
        fator:            parsed.data.fator,
      },
      include: {
        unidadeDestino: { select: { id: true, sigla: true, nome: true } },
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    if (msg.includes("Unique constraint"))
      return NextResponse.json({ error: "Já existe conversão para essa unidade de destino." }, { status: 409 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
