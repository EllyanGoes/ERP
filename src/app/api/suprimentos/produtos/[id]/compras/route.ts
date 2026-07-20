export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModuloAny } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModuloAny(["empresa", "compras"]);
  if (!auth.ok) return auth.response;

  const itemId = params.id;

  const [necessidadeItens, pedidoItens, conferenciaItens] = await Promise.all([
    // Necessidades via NecessidadeCompraItem
    prisma.necessidadeCompraItem.findMany({
      where: { itemId },
      include: {
        necessidade: {
          select: {
            id: true, numero: true, status: true,
            solicitante: true, dataNecessidade: true, createdAt: true,
          },
        },
      },
      orderBy: { necessidade: { createdAt: "desc" } },
    }),

    // Pedidos de Compra via PedidoCompraItem
    prisma.pedidoCompraItem.findMany({
      where: { itemId },
      include: {
        pedido: {
          select: {
            id: true, numero: true, status: true,
            valorTotal: true, dataEntregaPrevista: true, createdAt: true,
            fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
          },
        },
      },
      orderBy: { pedido: { createdAt: "desc" } },
    }),

    // Conferências via ConferenciaCompraItem
    prisma.conferenciaCompraItem.findMany({
      where: { itemId },
      include: {
        conferencia: {
          select: {
            id: true, numero: true, status: true,
            dataConferencia: true, createdAt: true,
            // Fornecedor direto da conferência (recebimentos avulsos, sem pedido).
            fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
            pedido: {
              select: {
                numero: true,
                fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
              },
            },
          },
        },
      },
      orderBy: { conferencia: { createdAt: "desc" } },
    }),
  ]);

  return NextResponse.json({
    necessidades: necessidadeItens.map((ni) => ({
      ...ni.necessidade,
      quantidade: ni.quantidade,
      observacao: ni.observacao,
    })),
    pedidos: pedidoItens.map((pi) => ({
      ...pi.pedido,
      quantidade: pi.quantidade,
      precoUnitario: pi.precoUnitario,
    })),
    conferencias: conferenciaItens.map((ci) => ({
      ...ci.conferencia,
      quantidadePedida: ci.quantidadePedida,
      quantidadeRecebida: ci.quantidadeRecebida,
      divergencia: ci.divergencia,
    })),
  });
}
