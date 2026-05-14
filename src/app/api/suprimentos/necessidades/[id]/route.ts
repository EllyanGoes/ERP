export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.necessidadeCompra.findUnique({
    where: { id: params.id },
    include: {
      itens: {
        include: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } } },
      },
      cotacoes: { select: { id: true, numero: true, status: true } },
    },
  });

  if (!record) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ data: record });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  const updateData: Record<string, unknown> = {};
  if (body.solicitante !== undefined) updateData.solicitante = body.solicitante || null;
  if (body.justificativa !== undefined) updateData.justificativa = body.justificativa || null;
  if (body.dataNecessidade !== undefined)
    updateData.dataNecessidade = body.dataNecessidade ? new Date(body.dataNecessidade) : null;
  if (body.observacoes !== undefined) updateData.observacoes = body.observacoes || null;

  const record = await prisma.necessidadeCompra.update({
    where: { id: params.id },
    data: updateData,
    include: {
      itens: {
        include: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } } },
      },
    },
  });

  return NextResponse.json({ data: record });
}
