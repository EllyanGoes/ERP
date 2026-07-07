export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { leadUpdateSchema } from "@/lib/validations/marketing-lead";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      eventos: { orderBy: { createdAt: "desc" } },
      campanha: true,
      etapa: true,
      funil: { select: { id: true, nome: true } },
      cliente: { select: { id: true, razaoSocial: true } },
      pedidoVenda: { select: { id: true, numero: true, valorTotal: true } },
    },
  });
  if (!lead || !lead.ativo) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }
  return NextResponse.json({ data: lead });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = leadUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const atual = await prisma.lead.findUnique({
    where: { id: params.id },
    select: { id: true, ativo: true, etapaId: true, status: true },
  });
  if (!atual || !atual.ativo) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }

  const d = parsed.data;
  const data: Record<string, unknown> = { ...d };
  if (d.email !== undefined) data.email = d.email || null;

  // Mudanças relevantes viram eventos na timeline (mesma transação do update).
  const lead = await prisma.$transaction(async (tx) => {
    const atualizado = await tx.lead.update({ where: { id: params.id }, data: data as any });

    if (d.etapaId !== undefined && d.etapaId !== atual.etapaId) {
      await tx.leadEvento.create({
        data: {
          leadId: params.id,
          tipo: "MUDANCA_ETAPA",
          dados: { deEtapaId: atual.etapaId, paraEtapaId: d.etapaId },
          criadoPor: auth.session.nome,
        },
      });
    }
    if (d.status && d.status !== atual.status) {
      if (d.status === "GANHO") {
        await tx.leadEvento.create({
          data: { leadId: params.id, tipo: "GANHO", criadoPor: auth.session.nome },
        });
      } else if (d.status === "PERDIDO") {
        await tx.leadEvento.create({
          data: {
            leadId: params.id,
            tipo: "PERDIDO",
            descricao: d.motivoPerda || null,
            criadoPor: auth.session.nome,
          },
        });
      }
    }
    return atualizado;
  });

  return NextResponse.json({ data: lead });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const existe = await prisma.lead.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existe) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });

  await prisma.lead.update({ where: { id: params.id }, data: { ativo: false } });
  return NextResponse.json({ data: { id: params.id } });
}
