export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recalcPedidoValorTotal } from "@/lib/pedido-totais";
import { getSession } from "@/lib/auth";

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  // Apenas administradores podem remover comodato.
  const session = await getSession();
  if (session?.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem remover comodato" }, { status: 403 });
  }
  await prisma.$transaction(async (tx) => {
    // Descobre o pedido vinculado ANTES de apagar, para recalcular o total dele.
    const mov = await tx.movimentacaoComodato.findUnique({
      where: { id: params.id },
      select: { pedidoVendaId: true },
    });
    await tx.movimentacaoComodato.delete({ where: { id: params.id } });
    if (mov?.pedidoVendaId) await recalcPedidoValorTotal(tx, mov.pedidoVendaId);
  });
  return NextResponse.json({ data: { ok: true } });
}
