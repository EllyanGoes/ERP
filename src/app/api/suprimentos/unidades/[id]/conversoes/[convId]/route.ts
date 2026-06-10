export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Ctx = { params: { id: string; convId: string } };

const patchSchema = z.object({
  fator: z.coerce.number().positive(),
});

// PATCH — update conversion factor
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Fator inválido" }, { status: 400 });

  try {
    const updated = await prisma.unidadeConversao.update({
      where: { id: params.convId },
      data:  { fator: parsed.data.fator },
      include: { unidadeDestino: { select: { id: true, sigla: true, nome: true } } },
    });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  try {
    await prisma.unidadeConversao.delete({ where: { id: params.convId } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
