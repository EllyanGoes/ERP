export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DELETE — remove uma linha do plano mestre
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.planoMestre.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível excluir." }, { status: 400 });
  }
}
