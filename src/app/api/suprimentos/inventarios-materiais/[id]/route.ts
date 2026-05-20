export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.inventarioMaterial.findUnique({
    where: { id: params.id },
    include: {
      localEstoque: { select: { id: true, nome: true } },
      colaborador:  { select: { id: true, nome: true } },
      itens: {
        include: {
          item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
        },
        orderBy: { item: { descricao: "asc" } },
      },
    },
  });
  if (!record) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ data: record });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  const record = await prisma.$transaction(async (tx) => {
    const updateData: Record<string, unknown> = {};

    if (body.status        !== undefined) updateData.status        = body.status;
    if (body.colaboradorId !== undefined) updateData.colaboradorId = body.colaboradorId || null;
    if (body.data          !== undefined) updateData.data          = body.data ? new Date(body.data) : null;
    if (body.tipo          !== undefined) updateData.tipo          = body.tipo;
    if (body.observacoes   !== undefined) updateData.observacoes   = body.observacoes?.trim() || null;

    if (Array.isArray(body.itens)) {
      await tx.inventarioMaterialItem.deleteMany({ where: { inventarioId: params.id } });
      updateData.itens = {
        create: body.itens.map((it: {
          itemId: string; localizacao?: string;
          saldoSistema: number; saldoFisico?: number; diferenca?: number;
        }) => ({
          itemId:      it.itemId,
          localizacao: it.localizacao?.trim() || null,
          saldoSistema: parseFloat(String(it.saldoSistema)),
          saldoFisico:  it.saldoFisico != null ? parseFloat(String(it.saldoFisico)) : null,
          diferenca:    it.diferenca   != null ? parseFloat(String(it.diferenca))   : null,
        })),
      };
    }

    return tx.inventarioMaterial.update({
      where: { id: params.id },
      data: updateData,
      include: {
        localEstoque: { select: { id: true, nome: true } },
        colaborador:  { select: { id: true, nome: true } },
        itens: {
          include: {
            item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
          },
        },
      },
    });
  });

  return NextResponse.json({ data: record });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.inventarioMaterial.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
