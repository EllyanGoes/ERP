export const dynamic = "force-dynamic";
// Recebimento manual do pedido — DESATIVADO como criador de título (decisão
// jul/2026): o CONTAS A RECEBER nasce na CONFIRMAÇÃO DA ENTREGA/RETIRADA
// (faturarPedidoSeEntregue), não na confirmação do pedido nem num recebimento
// antecipado. Esta rota deixou de criar a conta PAGA "adiantada":
//   • pedido SEM conta a receber (ainda não entregue) → 422 orientando que o
//     título nasce na entrega (não criamos antecipação);
//   • pedido JÁ faturado → 409 apontando para o fluxo de baixa em
//     Financeiro → Contas a Receber (ou o balcão, que baixa o saldo).
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { faturarPedidoSeEntregue } from "@/lib/contas-receber";
import { contabilizarPedidoVenda } from "@/lib/contabilidade";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const pedido = await prisma.pedidoVenda.findUnique({
    where: { id: params.id },
    select: { id: true, numero: true, status: true, intragrupo: true, valorTotal: true, _count: { select: { contasReceber: { where: { status: { not: "CANCELADA" } } } } } },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  if (pedido.status === "CANCELADO") {
    return NextResponse.json({ error: "Pedido cancelado não pode receber pagamento." }, { status: 422 });
  }
  if (pedido.intragrupo) {
    return NextResponse.json({ error: "Venda entre empresas do grupo não usa este recebimento." }, { status: 422 });
  }

  // Se a entrega total já aconteceu mas o faturamento ainda não rodou (corrida
  // entre gatilhos), fatura agora — aí o caminho certo é baixar o título.
  if (pedido._count.contasReceber === 0) {
    const faturou = await faturarPedidoSeEntregue(pedido.id).catch((e) => {
      console.error(`[receber] faturarPedidoSeEntregue(${pedido.id}) falhou:`, e);
      return false;
    });
    if (faturou) await contabilizarPedidoVenda(pedido.id).catch(() => {});
    if (!faturou) {
      return NextResponse.json(
        {
          error:
            "Pedido ainda não faturado — o título a receber nasce na confirmação da entrega/retirada. " +
            "Conclua a entrega (minuta Entregue) e baixe o título em Financeiro → Contas a Receber.",
        },
        { status: 422 },
      );
    }
  }

  return NextResponse.json(
    { error: "Este pedido já possui conta a receber registrada — baixe o título em Financeiro → Contas a Receber." },
    { status: 409 },
  );
}
