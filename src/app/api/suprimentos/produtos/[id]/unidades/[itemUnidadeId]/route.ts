export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { id: string; itemUnidadeId: string } };

// ── DELETE — remove unit from product ───────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Ctx) {
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
