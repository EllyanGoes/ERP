export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { recomputarStatusPedido } from "@/lib/pedido-totais";
import { apagarLancamentosContabeis } from "@/lib/contabilidade";

// Estorna o recebimento de um título: remove os lançamentos de caixa/banco,
// volta o título para ABERTA (zera o recebido) e recomputa o status financeiro
// do pedido vinculado. Desfaz também a contabilização do recebimento.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const result = await prisma.$transaction(async (tx) => {
    const conta = await tx.contaReceber.findUnique({ where: { id: params.id } });
    if (!conta) return { erro: { msg: "Conta não encontrada", status: 404 } } as const;
    if (conta.status !== "PAGA" && conta.status !== "PARCIAL") {
      return { erro: { msg: "Só é possível estornar um título que já teve recebimento (pago ou parcial).", status: 409 } } as const;
    }

    // Remove os lançamentos de caixa/banco deste recebimento.
    await tx.lancamentoFinanceiro.deleteMany({ where: { contaReceberId: params.id } });
    // Título volta para ABERTA, zera o recebido (e multa/juros aplicados na baixa).
    await tx.contaReceber.update({
      where: { id: params.id },
      data: { valorPago: 0, valorMulta: 0, valorJuros: 0, dataPagamento: null, formaPagamento: null, status: "ABERTA" },
    });
    if (conta.pedidoVendaId) await recomputarStatusPedido(tx, conta.pedidoVendaId);
    // Desfaz a contabilização do recebimento DENTRO da transação (atômico: se
    // falhar, o estorno inteiro faz rollback e não sobra lançamento órfão).
    await apagarLancamentosContabeis({ empresaId: conta.empresaId, origemTipo: "RECEBIMENTO", origemId: params.id }, tx);
    return { erro: null, empresaId: conta.empresaId } as const;
  });

  if (result.erro) return NextResponse.json({ error: result.erro.msg }, { status: result.erro.status });
  return NextResponse.json({ ok: true });
}
