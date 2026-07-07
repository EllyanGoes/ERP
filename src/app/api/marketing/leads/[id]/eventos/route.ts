export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { leadEventoSchema } from "@/lib/validations/marketing-lead";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = leadEventoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const lead = await prisma.lead.findUnique({ where: { id: params.id }, select: { id: true, ativo: true } });
  if (!lead || !lead.ativo) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }

  const evento = await prisma.leadEvento.create({
    data: {
      leadId: params.id,
      tipo: parsed.data.tipo,
      descricao: parsed.data.descricao,
      criadoPor: auth.session.nome,
    },
  });

  return NextResponse.json({ data: evento }, { status: 201 });
}
