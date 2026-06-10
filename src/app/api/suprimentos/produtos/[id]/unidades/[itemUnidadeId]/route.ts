export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Ctx = { params: { id: string; itemUnidadeId: string } };

// ── PATCH — edit conversion factor / base unit ──────────────────────────────
const patchSchema = z.object({
  fatorConversao: z.coerce.number().positive().nullable().optional(),
  baseUnidadeId:  z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  try {
    const updated = await prisma.itemUnidade.update({
      where:   { id: params.itemUnidadeId },
      data:    { fatorConversao: parsed.data.fatorConversao ?? null, baseUnidadeId: parsed.data.baseUnidadeId ?? null },
      include: {
        unidade:     { select: { id: true, sigla: true, nome: true } },
        baseUnidade: { select: { id: true, sigla: true, nome: true } },
      },
    });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── DELETE — remove unit from product ───────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  try {
    await prisma.itemUnidade.delete({
      where: { id: params.itemUnidadeId },
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
