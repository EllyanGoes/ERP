export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const setor = await prisma.setor.findUnique({
    where: { id: params.id },
    include: { _count: { select: { colaboradores: true } } },
  });

  if (!setor) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(setor);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { nome, descricao, ativo, paiId } = body;

  const data: Record<string, unknown> = {};
  if (nome !== undefined) {
    if (!nome?.trim()) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    data.nome = nome.trim();
  }
  if (descricao !== undefined) data.descricao = descricao?.trim() || null;
  if (ativo !== undefined) data.ativo = ativo;
  if (paiId !== undefined) {
    if (paiId === params.id) return NextResponse.json({ error: "Um setor não pode ser pai de si mesmo" }, { status: 400 });
    if (paiId) {
      // Guarda de ciclo: o novo pai não pode ser descendente deste setor.
      let cursor: string | null = paiId;
      while (cursor) {
        if (cursor === params.id) {
          return NextResponse.json({ error: "O setor pai escolhido é um subsetor deste setor (criaria um ciclo)" }, { status: 400 });
        }
        const p: { paiId: string | null } | null = await prisma.setor.findUnique({ where: { id: cursor }, select: { paiId: true } });
        if (!p) return NextResponse.json({ error: "Setor pai não encontrado" }, { status: 400 });
        cursor = p.paiId;
      }
    }
    data.paiId = paiId || null;
  }

  const setor = await prisma.setor.update({
    where: { id: params.id },
    data,
    include: { _count: { select: { colaboradores: true } } },
  });

  return NextResponse.json(setor);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const count = await prisma.colaborador.count({ where: { setorId: params.id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `Setor possui ${count} colaborador(es) vinculado(s)` },
      { status: 409 }
    );
  }
  const filhos = await prisma.setor.count({ where: { paiId: params.id } });
  if (filhos > 0) {
    return NextResponse.json(
      { error: `Setor possui ${filhos} subsetor(es) — mova ou exclua os subsetores antes` },
      { status: 409 }
    );
  }

  await prisma.setor.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
