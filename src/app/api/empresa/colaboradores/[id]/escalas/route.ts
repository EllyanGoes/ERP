export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// GET /api/empresa/colaboradores/[id]/escalas — vigências de escala do colaborador.
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;
  const data = await prisma.colaboradorEscala.findMany({
    where: { colaboradorId: params.id },
    orderBy: { data: "desc" },
    include: { horario: { include: { faixas: { orderBy: { ordem: "asc" } } } } },
  });
  return NextResponse.json({ data });
}

// POST /api/empresa/colaboradores/[id]/escalas — nova vigência (a partir de `data`).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  if (!b.horarioId) return NextResponse.json({ error: "Escolha o horário de trabalho" }, { status: 400 });
  if (!b.data) return NextResponse.json({ error: "Informe a data de início da vigência" }, { status: 400 });

  const [colab, horario] = await Promise.all([
    prisma.colaborador.findUnique({ where: { id: params.id }, select: { id: true } }),
    prisma.horarioTrabalho.findUnique({ where: { id: b.horarioId }, select: { id: true } }),
  ]);
  if (!colab) return NextResponse.json({ error: "Colaborador não encontrado" }, { status: 404 });
  if (!horario) return NextResponse.json({ error: "Horário não encontrado" }, { status: 400 });

  const escala = await prisma.colaboradorEscala.create({
    data: {
      colaboradorId: params.id,
      horarioId: b.horarioId,
      data: new Date(`${String(b.data).slice(0, 10)}T12:00:00`),
    },
    include: { horario: { include: { faixas: { orderBy: { ordem: "asc" } } } } },
  });
  return NextResponse.json({ data: escala }, { status: 201 });
}

// DELETE /api/empresa/colaboradores/[id]/escalas?escalaId=... — remove a vigência.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;
  const escalaId = new URL(req.url).searchParams.get("escalaId");
  if (!escalaId) return NextResponse.json({ error: "Informe a escala" }, { status: 400 });
  await prisma.colaboradorEscala.deleteMany({ where: { id: escalaId, colaboradorId: params.id } });
  return NextResponse.json({ ok: true });
}
