export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.cotacaoCompra.findUnique({
    where: { id: params.id },
    include: {
      necessidade: {
        select: {
          id: true,
          numero: true,
          itens: {
            include: {
              item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
            },
          },
        },
      },
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
  if (body.nome               !== undefined) updateData.nome               = body.nome?.trim()        || null;
  if (body.observacoes        !== undefined) updateData.observacoes        = body.observacoes?.trim() || null;
  if (body.infoEntrega        !== undefined) updateData.infoEntrega        = body.infoEntrega?.trim() || null;
  if (body.dataLimiteResposta !== undefined)
    updateData.dataLimiteResposta = body.dataLimiteResposta ? new Date(body.dataLimiteResposta) : null;

  const record = await prisma.cotacaoCompra.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ data: record });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem excluir cotações" }, { status: 403 });
  }

  const cotacao = await prisma.cotacaoCompra.findUnique({
    where: { id: params.id },
    select: { id: true, pedidos: { select: { id: true, status: true } } },
  });
  if (!cotacao) return NextResponse.json({ error: "Cotação não encontrada" }, { status: 404 });

  // Bloqueia se houver pedido de compra ativo gerado a partir desta cotação
  const pedidosAtivos = cotacao.pedidos.filter((p) => p.status !== "CANCELADO");
  if (pedidosAtivos.length > 0) {
    return NextResponse.json(
      { error: `Não é possível excluir: a cotação possui ${pedidosAtivos.length} pedido(s) de compra vinculado(s). Cancele os pedidos primeiro.` },
      { status: 409 }
    );
  }

  await prisma.cotacaoCompra.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
