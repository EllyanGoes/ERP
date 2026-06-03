export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// CANCELADA é um cancelamento "soft" (não exclui registros): disponível em todos os
// estados de trabalho, exceto nos terminais já atendidos. É um estado final.
const TRANSITIONS: Record<string, string[]> = {
  RASCUNHO:             ["AGUARDANDO_APROVACAO", "CANCELADA"],
  AGUARDANDO_APROVACAO: ["APROVADA", "REJEITADA", "CANCELADA"],
  APROVADA:             ["EM_COTACAO", "EM_PEDIDO", "CANCELADA"],
  REJEITADA:            ["AGUARDANDO_APROVACAO", "CANCELADA"],
  EM_COTACAO:           ["EM_PEDIDO", "TOTALMENTE_ATENDIDA", "PARCIALMENTE_ATENDIDA", "CANCELADA"],
  EM_PEDIDO:            ["TOTALMENTE_ATENDIDA", "PARCIALMENTE_ATENDIDA", "CANCELADA"],
  TOTALMENTE_ATENDIDA:  [],
  PARCIALMENTE_ATENDIDA: [],
  CANCELADA:            [],
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { status, aprovadoPor, motivoReprovacao, motivoCancelamento } = body;

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
  } else if (status === "REJEITADA") {
    updateData.motivoReprovacao = motivoReprovacao || null;
    updateData.dataAprovacao = new Date();
  } else if (status === "CANCELADA") {
    updateData.motivoCancelamento = motivoCancelamento || null;
    updateData.dataCancelamento = new Date();
  }

  const record = await prisma.necessidadeCompra.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ data: record });
}
