export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { comodatoMovimentoSchema } from "@/lib/validations/comodato";
import { recalcPedidoValorTotal } from "@/lib/pedido-totais";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clienteId = searchParams.get("clienteId") || undefined;

  const movimentos = await prisma.movimentacaoComodato.findMany({
    where: clienteId ? { clienteId } : {},
    include: {
      cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      item: { select: { id: true, codigo: true, descricao: true } },
    },
    orderBy: { data: "desc" },
  });

  return NextResponse.json({ data: movimentos });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = comodatoMovimentoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { clienteId, itemId, tipo, quantidade, valorUnitario, data, documento, observacoes, pedidoVendaId } = parsed.data;

  // Comodato avulso (tela /comodato, sem pedido) é exclusivo de administradores.
  // Amarrado a um pedido de venda, qualquer usuário (ex.: vendedor) pode lançar pela tela do pedido.
  if (!pedidoVendaId && session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem lançar comodato avulso" }, { status: 403 });
  }

  let valor = valorUnitario;
  if (valor == null) {
    const item = await prisma.item.findUnique({ where: { id: itemId }, select: { precoVenda: true } });
    valor = item ? Number(item.precoVenda) : 0;
  }

  const movimento = await prisma.$transaction(async (tx) => {
    const mov = await tx.movimentacaoComodato.create({
      data: {
        clienteId,
        itemId,
        tipo,
        quantidade,
        valorUnitario: valor,
        origem: pedidoVendaId ? "AUTOMATICO" : "MANUAL",
        pedidoVendaId: pedidoVendaId ?? null,
        data: data ? new Date(data) : new Date(),
        documento: documento ?? null,
        observacoes: observacoes ?? null,
      },
      include: {
        cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        item: { select: { id: true, codigo: true, descricao: true } },
      },
    });

    // Comodato amarrado a um pedido entra no total dele → recalcula.
    if (pedidoVendaId) await recalcPedidoValorTotal(tx, pedidoVendaId);

    return mov;
  });

  return NextResponse.json({ data: movimento }, { status: 201 });
}
