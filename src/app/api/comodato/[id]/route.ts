export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recalcPedidoValorTotal } from "@/lib/pedido-totais";
import { getSession } from "@/lib/auth";

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Descobre o pedido vinculado ANTES de apagar — define a permissão e o recálculo do total.
  const mov = await prisma.movimentacaoComodato.findUnique({
    where: { id: params.id },
    select: { pedidoVendaId: true },
  });
  if (!mov) {
    return NextResponse.json({ error: "Movimentação não encontrada" }, { status: 404 });
  }

  // Comodato avulso (sem pedido) só o administrador remove.
  // Amarrado a um pedido, qualquer usuário pode remover (ex.: corrigir o próprio lançamento).
  if (!mov.pedidoVendaId && session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem remover comodato avulso" }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.movimentacaoComodato.delete({ where: { id: params.id } });
    if (mov.pedidoVendaId) await recalcPedidoValorTotal(tx, mov.pedidoVendaId);
  });
  return NextResponse.json({ data: { ok: true } });
}
