export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Ctx = { params: { id: string } };

// ── GET — list units for a product ──────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Ctx) {
  // Lazy backfill: if item has unidadeId but no principal ItemUnidade, create it
  const item = await prisma.item.findUnique({
    where: { id: params.id },
    select: { unidadeId: true },
  });
  if (item?.unidadeId) {
    const hasPrincipal = await prisma.itemUnidade.findFirst({
      where: { itemId: params.id, isPrincipal: true },
    });
    if (!hasPrincipal) {
      await prisma.itemUnidade.upsert({
        where:  { itemId_unidadeId: { itemId: params.id, unidadeId: item.unidadeId } },
        create: { itemId: params.id, unidadeId: item.unidadeId, isPrincipal: true, fatorConversao: null, baseUnidadeId: null },
        update: { isPrincipal: true },
      });
    }
  }

  const unidades = await prisma.itemUnidade.findMany({
    where: { itemId: params.id },
    include: {
      unidade:     { select: { id: true, sigla: true, nome: true } },
      baseUnidade: { select: { id: true, sigla: true, nome: true } },
    },
    orderBy: [{ isPrincipal: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(unidades);
}

// ── POST — add unit to product ───────────────────────────────────────────────
const postSchema = z.object({
  unidadeId:      z.string().min(1),
  baseUnidadeId:  z.string().optional().nullable(),
  fatorConversao: z.coerce.number().positive().optional().nullable(),
  isPrincipal:    z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { unidadeId, baseUnidadeId, fatorConversao, isPrincipal } = parsed.data;
  const itemId = params.id;

  try {
    // If marking as principal: unmark others + update item.unidadeId
    if (isPrincipal) {
      await prisma.itemUnidade.updateMany({
        where: { itemId, isPrincipal: true },
        data:  { isPrincipal: false },
      });
      await prisma.item.update({
        where: { id: itemId },
        data:  { unidadeId: unidadeId },
      });
    }

    const created = await prisma.itemUnidade.upsert({
      where:  { itemId_unidadeId: { itemId, unidadeId } },
      create: { itemId, unidadeId, baseUnidadeId: baseUnidadeId ?? null, fatorConversao: fatorConversao ?? null, isPrincipal: isPrincipal ?? false },
      update: { baseUnidadeId: baseUnidadeId ?? null, fatorConversao: fatorConversao ?? null, isPrincipal: isPrincipal ?? false },
      include: {
        unidade:     { select: { id: true, sigla: true, nome: true } },
        baseUnidade: { select: { id: true, sigla: true, nome: true } },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
