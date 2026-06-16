export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { reverterEExcluirConferencias } from "@/lib/compras-cascade";

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
      pedidos: { select: { id: true, numero: true, status: true, conferencia: { select: { id: true } } } },
      // Pendência de aprovação atual — libera o botão de aprovar ao aprovador
      // designado (além do ADMIN) na tela da cotação.
      aprovacoes: { where: { status: "PENDENTE" }, select: { id: true, aprovadorId: true } },
    },
  });

  if (!record) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ data: record });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

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
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem excluir cotações" }, { status: 403 });
  }

  const cotacao = await prisma.cotacaoCompra.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!cotacao) return NextResponse.json({ error: "Cotação não encontrada" }, { status: 404 });

  // Exclusão em cascata: remove os pedidos de compra gerados a partir desta
  // cotação E os documentos de entrada vinculados a esses pedidos, revertendo
  // o estoque lançado. Propostas dos fornecedores cascateiam ao excluir a cotação.
  await prisma.$transaction(async (tx) => {
    const pedidos = await tx.pedidoCompra.findMany({
      where: { cotacaoId: params.id },
      select: { id: true },
    });
    const pedidoIds = pedidos.map((p) => p.id);

    if (pedidoIds.length > 0) {
      const confs = await tx.conferenciaCompra.findMany({
        where: { pedidoId: { in: pedidoIds } },
        select: { id: true },
      });
      await reverterEExcluirConferencias(tx, confs.map((c) => c.id));
      await tx.pedidoCompra.deleteMany({ where: { id: { in: pedidoIds } } });
    }

    await tx.cotacaoCompra.delete({ where: { id: params.id } });
  });

  return NextResponse.json({ success: true });
}
