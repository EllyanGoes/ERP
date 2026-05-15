export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.necessidadeCompra.findUnique({
    where: { id: params.id },
    include: {
      filial:       { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      localEstoque: { select: { id: true, nome: true } },
      centroCusto:  { select: { id: true, codigo: true, nome: true } },
      itens: {
        include: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } } },
      },
      cotacoes: { select: { id: true, numero: true, status: true } },
      aprovacoes: {
        include: { aprovador: { select: { id: true, nome: true, email: true } } },
        orderBy: { createdAt: "asc" },
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

    if (body.solicitante        !== undefined) updateData.solicitante        = body.solicitante?.trim()        || null;
    if (body.justificativa      !== undefined) updateData.justificativa      = body.justificativa?.trim()      || null;
    if (body.dataNecessidade    !== undefined) updateData.dataNecessidade    = body.dataNecessidade ? new Date(body.dataNecessidade) : null;
    if (body.observacoes        !== undefined) updateData.observacoes        = body.observacoes?.trim()        || null;
    if (body.filialId           !== undefined) updateData.filialId           = body.filialId                   || null;
    if (body.localEstoqueId     !== undefined) updateData.localEstoqueId     = body.localEstoqueId             || null;
    if (body.centroCustoId      !== undefined) updateData.centroCustoId      = body.centroCustoId              || null;
    if (body.tipoCompra         !== undefined) updateData.tipoCompra         = body.tipoCompra?.trim()         || null;
    if (body.motivo             !== undefined) updateData.motivo             = body.motivo?.trim()             || null;
    if (body.categoria          !== undefined) updateData.categoria          = body.categoria?.trim()          || null;
    if (body.projeto            !== undefined) updateData.projeto            = body.projeto?.trim()            || null;
    if (body.classificacaoAuxiliar !== undefined) updateData.classificacaoAuxiliar = body.classificacaoAuxiliar?.trim() || null;
    if (body.prioridade         !== undefined) updateData.prioridade         = parseInt(String(body.prioridade));

    // Replace items when provided
    if (Array.isArray(body.itens)) {
      await tx.necessidadeCompraItem.deleteMany({ where: { necessidadeId: params.id } });
      updateData.itens = {
        create: body.itens.map((item: { itemId: string; quantidade: number; observacao?: string; unidade?: string }) => ({
          itemId:     item.itemId,
          quantidade: parseFloat(String(item.quantidade)),
          observacao: item.observacao?.trim() || null,
          unidade:    item.unidade?.trim()    || null,
        })),
      };
    }

    return tx.necessidadeCompra.update({
      where: { id: params.id },
      data: updateData,
      include: {
        filial:       { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        localEstoque: { select: { id: true, nome: true } },
        centroCusto:  { select: { id: true, codigo: true, nome: true } },
        itens: {
          include: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } } },
        },
      },
    });
  });

  return NextResponse.json({ data: record });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.necessidadeCompra.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
