export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TRANSITIONS: Record<string, string[]> = {
  RASCUNHO: ["AGUARDANDO_APROVACAO", "CANCELADA"],
  AGUARDANDO_APROVACAO: ["APROVADA", "REPROVADA", "CANCELADA"],
  APROVADA: [],
  REPROVADA: [],
  CANCELADA: [],
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { status, aprovadoPor, motivoReprovacao } = body;

  const current = await prisma.necessidadeCompra.findUnique({
    where: { id: params.id },
    select: { status: true },
  });

  if (!current) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const allowed = TRANSITIONS[current.status] ?? [];
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `Transição inválida: ${current.status} → ${status}` },
      { status: 422 }
    );
  }

  const updateData: Record<string, unknown> = { status };
  if (status === "AGUARDANDO_APROVACAO") {
    // No extra fields
  } else if (status === "APROVADA") {
    updateData.aprovadoPor = aprovadoPor || null;
    updateData.dataAprovacao = new Date();
  } else if (status === "REPROVADA") {
    updateData.motivoReprovacao = motivoReprovacao || null;
    updateData.dataAprovacao = new Date();
  }

  const record = await prisma.necessidadeCompra.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ data: record });
}
