export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const data: Prisma.EstadoWipUpdateInput = {};
  if (typeof body.nome === "string") data.nome = body.nome.trim();
  if ("ordem" in body) { const n = numOrNull(body.ordem); data.ordem = n != null ? Math.trunc(n) : 0; }
  if ("ativo" in body) data.ativo = body.ativo !== false;

  try {
    const updated = await prisma.estadoWip.update({ where: { id: params.id }, data });
    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar." }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  try {
    await prisma.estadoWip.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível excluir." }, { status: 400 });
  }
}
