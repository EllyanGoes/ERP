export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.pedidoCompra.findUnique({
    where: { id: params.id },
    include: {
      fornecedor: {
        select: {
          id: true,
          razaoSocial: true,
          nomeFantasia: true,
          cpfCnpj: true,
          contato: true,
          email: true,
        },
      },
      cotacao: { select: { id: true, numero: true, nome: true } },
      itens: {
        include: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } } },
      },
      conferencia: { select: { id: true, numero: true, status: true } },
    },
  });

  if (!record) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  // Fetch CotacaoFornecedor to get proposal details (frete, desconto, condições, etc.)
  let cotacaoFornecedor = null;
  if (record.cotacaoId && record.fornecedorId) {
    const allCfs = await prisma.cotacaoFornecedor.findMany({
      where: { cotacaoId: record.cotacaoId },
      orderBy: { id: "asc" },
    });
    const cfIndex = allCfs.findIndex((cf) => cf.fornecedorId === record.fornecedorId);
    const cf = allCfs[cfIndex];
    if (cf) {
      cotacaoFornecedor = {
        ...cf,
        propostaNumero: cfIndex + 1,
      };
    }
  }

  return NextResponse.json({ data: { ...record, cotacaoFornecedor } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  const updateData: Record<string, unknown> = {};
  if (body.status !== undefined) updateData.status = body.status;
  if (body.dataEntregaPrevista !== undefined)
    updateData.dataEntregaPrevista = body.dataEntregaPrevista ? new Date(body.dataEntregaPrevista) : null;
  if (body.observacoes !== undefined) updateData.observacoes = body.observacoes || null;

  const record = await prisma.pedidoCompra.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ data: record });
}
