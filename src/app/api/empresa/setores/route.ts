export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ativo = searchParams.get("ativo");

  const where = ativo !== null ? { ativo: ativo === "true" } : {};

  const setores = await prisma.setor.findMany({
    where,
    orderBy: { nome: "asc" },
    include: { _count: { select: { colaboradores: true } } },
  });

  return NextResponse.json(setores);
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { nome, descricao } = body;

  if (!nome?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  const setor = await prisma.setor.create({
    data: {
      id: crypto.randomUUID(),
      nome: nome.trim(),
      descricao: descricao?.trim() || null,
    },
  });

  return NextResponse.json(setor, { status: 201 });
}
