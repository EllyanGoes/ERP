export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { campanhaSchema } from "@/lib/validations/marketing-campanha";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const campanha = await prisma.campanha.findUnique({
    where: { id: params.id },
    include: { _count: { select: { leads: true } } },
  });
  if (!campanha) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  return NextResponse.json({ data: campanha });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = campanhaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existe = await prisma.campanha.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existe) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });

  const d = parsed.data;
  const campanha = await prisma.campanha.update({
    where: { id: params.id },
    data: {
      ...d,
      orcamento: d.orcamento ?? null,
      dataInicio: d.dataInicio ? new Date(d.dataInicio) : null,
      dataFim: d.dataFim ? new Date(d.dataFim) : null,
    },
  });

  return NextResponse.json({ data: campanha });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const existe = await prisma.campanha.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existe) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });

  await prisma.campanha.update({ where: { id: params.id }, data: { ativo: false } });
  return NextResponse.json({ data: { id: params.id } });
}
