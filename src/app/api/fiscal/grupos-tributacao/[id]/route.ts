export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const data: { nome?: string; ativo?: boolean } = {};
  if (body.nome !== undefined) {
    const nome = String(body.nome).trim();
    if (!nome) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    data.nome = nome;
  }
  if (body.ativo !== undefined) data.ativo = Boolean(body.ativo);

  const grupo = await prisma.grupoTributacao.update({ where: { id: params.id }, data });
  return NextResponse.json(grupo);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const emUso = await prisma.grupoTributacao.findUnique({
    where: { id: params.id },
    include: { _count: { select: { itens: true, regras: true } } },
  });
  if (!emUso) return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });
  if (emUso._count.itens > 0 || emUso._count.regras > 0) {
    return NextResponse.json(
      { error: `Grupo em uso (${emUso._count.itens} itens, ${emUso._count.regras} regras) — desative em vez de excluir` },
      { status: 409 },
    );
  }

  await prisma.grupoTributacao.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
