export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { etapaLeadSchema } from "@/lib/validations/marketing-lead";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = etapaLeadSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existe = await prisma.etapaLead.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existe) return NextResponse.json({ error: "Etapa não encontrada" }, { status: 404 });

  const etapa = await prisma.etapaLead.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ data: etapa });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const existe = await prisma.etapaLead.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existe) return NextResponse.json({ error: "Etapa não encontrada" }, { status: 404 });

  await prisma.etapaLead.update({ where: { id: params.id }, data: { ativo: false } });
  return NextResponse.json({ data: { id: params.id } });
}
