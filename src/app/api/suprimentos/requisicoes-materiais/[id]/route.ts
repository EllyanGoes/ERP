export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.requisicaoMaterial.findUnique({
    where: { id: params.id },
    include: {
      localEstoque: { select: { id: true, nome: true } },
      colaborador:  { select: { id: true, nome: true } },
      setor:        { select: { id: true, nome: true } },
      almoxarife:   { select: { id: true, nome: true } },
      centroCusto:  { select: { id: true, codigo: true, nome: true } },
      itens: {
        include: {
          item:       { select: { id: true, codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
          centroCusto: { select: { id: true, codigo: true, nome: true } },
        },
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
    if (body.tipo          !== undefined) updateData.tipo          = body.tipo;
    if (body.colaboradorId !== undefined) updateData.colaboradorId = body.colaboradorId || null;
    if (body.setorId       !== undefined) updateData.setorId       = body.setorId       || null;
    if (body.almoxarifeId  !== undefined) updateData.almoxarifeId  = body.almoxarifeId  || null;
    if (body.os            !== undefined) updateData.os            = body.os?.trim()    || null;
    if (body.centroCustoId !== undefined) updateData.centroCustoId = body.centroCustoId || null;
    if (body.contaContabil !== undefined) updateData.contaContabil = body.contaContabil?.trim() || null;
    if (body.data          !== undefined) updateData.data          = body.data ? new Date(body.data) : null;
    if (body.observacoes   !== undefined) updateData.observacoes   = body.observacoes?.trim() || null;

    if (Array.isArray(body.itens)) {
      await tx.requisicaoMaterialItem.deleteMany({ where: { requisicaoId: params.id } });
      updateData.itens = {
        create: body.itens.map((it: {
          itemId: string; quantidade: number; unidade?: string;
          localizacao?: string; centroCustoId?: string; contaContabil?: string;
          os?: string; requisicaoRef?: string;
        }) => ({
          itemId:       it.itemId,
          quantidade:   parseFloat(String(it.quantidade)),
          unidade:      it.unidade?.trim()        || null,
          localizacao:  it.localizacao?.trim()    || null,
          centroCustoId: it.centroCustoId         || null,
          contaContabil: it.contaContabil?.trim() || null,
          os:           it.os?.trim()             || null,
          requisicaoRef: it.requisicaoRef?.trim() || null,
        })),
      };
    }

    return tx.requisicaoMaterial.update({
      where: { id: params.id },
      data: updateData,
      include: {
        localEstoque: { select: { id: true, nome: true } },
        colaborador:  { select: { id: true, nome: true } },
        setor:        { select: { id: true, nome: true } },
        almoxarife:   { select: { id: true, nome: true } },
        centroCusto:  { select: { id: true, codigo: true, nome: true } },
        itens: {
          include: {
            item:        { select: { id: true, codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
            centroCusto: { select: { id: true, codigo: true, nome: true } },
          },
        },
      },
    });
  });

  return NextResponse.json({ data: record });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.requisicaoMaterial.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
