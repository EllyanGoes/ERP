export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const produtos = await prisma.produtoFornecedor.findMany({
    where: { fornecedorId: params.id },
    include: { item: { select: { id: true, codigo: true, descricao: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(produtos);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  if (!body.itemId) {
    return NextResponse.json({ error: "itemId é obrigatório" }, { status: 400 });
  }

  // Check if fornecedor exists
  const forn = await prisma.fornecedor.findUnique({ where: { id: params.id } });
  if (!forn) return NextResponse.json({ error: "Fornecedor não encontrado" }, { status: 404 });

  const parseDecimal = (v: unknown) =>
    v != null && v !== "" ? parseFloat(String(v)) : null;
  const parseInt_ = (v: unknown) =>
    v != null && v !== "" ? parseInt(String(v), 10) : null;

  try {
    const record = await prisma.produtoFornecedor.create({
      data: {
        itemId: body.itemId,
        fornecedorId: params.id,
        codigoFornecedor: body.codigoFornecedor?.trim() || null,
        precoUltimo: parseDecimal(body.precoUltimo),
        prazoEntregaDias: parseInt_(body.prazoEntregaDias),
        especificacao: body.especificacao?.trim() || null,
        tempoResuprimento: parseInt_(body.tempoResuprimento),
        classificacao: body.classificacao?.trim() || null,
        percentual: parseDecimal(body.percentual),
        dataUltimaCompra: body.dataUltimaCompra ? new Date(body.dataUltimaCompra) : null,
        indiceFinanceiro: body.indiceFinanceiro?.trim() || null,
        qtdeUltimaCompra: parseDecimal(body.qtdeUltimaCompra),
        unidade: body.unidade?.trim() || null,
        ultimaQtdeDev: parseDecimal(body.ultimaQtdeDev),
      },
      include: {
        item: { select: { id: true, codigo: true, descricao: true } },
      },
    });
    return NextResponse.json({ data: record }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Este produto já está vinculado a este fornecedor" }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const produtoFornecedorId = searchParams.get("produtoFornecedorId");

  if (!produtoFornecedorId) {
    return NextResponse.json({ error: "produtoFornecedorId é obrigatório" }, { status: 400 });
  }

  await prisma.produtoFornecedor.delete({
    where: { id: produtoFornecedorId, fornecedorId: params.id },
  });

  return NextResponse.json({ ok: true });
}
