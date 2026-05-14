export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const data = await prisma.produtoFornecedor.findMany({
    where: { itemId: params.id },
    include: {
      fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  if (!body.fornecedorId) {
    return NextResponse.json({ error: "fornecedorId é obrigatório" }, { status: 400 });
  }

  // Check if item exists
  const item = await prisma.item.findUnique({ where: { id: params.id } });
  if (!item) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

  try {
    const record = await prisma.produtoFornecedor.create({
      data: {
        itemId: params.id,
        fornecedorId: body.fornecedorId,
        codigoFornecedor: body.codigoFornecedor?.trim() || null,
        precoUltimo: body.precoUltimo != null ? parseFloat(body.precoUltimo) : null,
        prazoEntregaDias: body.prazoEntregaDias != null ? parseInt(body.prazoEntregaDias) : null,
      },
      include: {
        fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      },
    });
    return NextResponse.json({ data: record }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Este fornecedor já está vinculado ao produto" }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const produtoFornecedorId = searchParams.get("produtoFornecedorId");

  if (!produtoFornecedorId) {
    return NextResponse.json({ error: "produtoFornecedorId é obrigatório" }, { status: 400 });
  }

  await prisma.produtoFornecedor.delete({
    where: { id: produtoFornecedorId, itemId: params.id },
  });

  return NextResponse.json({ ok: true });
}
