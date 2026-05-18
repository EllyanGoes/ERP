export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.cotacaoCompra.findUnique({
    where: { id: params.id },
    include: {
      necessidade: { select: { id: true, numero: true } },
      fornecedores: {
        include: {
          fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true, cpfCnpj: true, email: true, contato: true } },
          itens: {
            include: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } } },
          },
          historico: {
            orderBy: { versao: "desc" },
            take: 1,
            select: { versao: true, createdAt: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      pedidos: { select: { id: true, numero: true, status: true } },
    },
  });

  if (!record) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ data: record });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  const updateData: Record<string, unknown> = {};
  if (body.observacoes !== undefined) updateData.observacoes = body.observacoes || null;
  if (body.dataLimiteResposta !== undefined)
    updateData.dataLimiteResposta = body.dataLimiteResposta ? new Date(body.dataLimiteResposta) : null;

  const record = await prisma.cotacaoCompra.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ data: record });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.cotacaoCompra.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
