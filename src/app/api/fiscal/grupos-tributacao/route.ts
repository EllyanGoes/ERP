export const dynamic = "force-dynamic";

// GrupoTributacao é cadastro COMPARTILHADO (sem empresaId) — a "gaveta fiscal"
// do produto, referenciada pelas RegraTributacao de cada empresa.

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const grupos = await prisma.grupoTributacao.findMany({
    orderBy: { codigo: "asc" },
    include: { _count: { select: { itens: true, regras: true } } },
  });
  return NextResponse.json(grupos);
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const codigo = String(body.codigo ?? "").trim().toUpperCase();
  const nome = String(body.nome ?? "").trim();
  if (!codigo || !nome) {
    return NextResponse.json({ error: "Código e nome são obrigatórios" }, { status: 400 });
  }

  try {
    const grupo = await prisma.grupoTributacao.create({ data: { codigo, nome } });
    return NextResponse.json(grupo, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Já existe um grupo com este código" }, { status: 409 });
    }
    throw e;
  }
}
