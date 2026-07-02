export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { recomputarStatusFinanceiroCompra } from "@/lib/pedido-totais";
import { apagarLancamentosContabeis, contabilizarEntradaEstoque } from "@/lib/contabilidade";

// Estorna o pagamento de um título a pagar: remove os lançamentos de caixa/banco,
// volta o título para ABERTA (zera o pago), desfaz a contabilização do pagamento
// e recomputa o status financeiro do pedido de compra vinculado.
// Espelho de contas-receber/[id]/estorno.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const result = await prisma.$transaction(async (tx) => {
    const conta = await tx.contaPagar.findUnique({ where: { id: params.id } });
    if (!conta) return { erro: { msg: "Conta não encontrada", status: 404 } } as const;
    if (conta.status !== "PAGA" && conta.status !== "PARCIAL") {
      return { erro: { msg: "Só é possível estornar um título que já teve pagamento (pago ou parcial).", status: 409 } } as const;
    }
    // Baixa vinda de um Encontro de Contas deve ser desfeita por lá (senão a
    // compensação fica inconsistente).
    const baixaCompensacao = await tx.lancamentoFinanceiro.findFirst({
      where: { contaPagarId: params.id, contaBancaria: { compensacao: true } }, select: { id: true },
    });
    if (baixaCompensacao) {
      return { erro: { msg: "Este título foi baixado por um Encontro de Contas — estorne a compensação para reabri-lo.", status: 409 } } as const;
    }

    await tx.lancamentoFinanceiro.deleteMany({ where: { contaPagarId: params.id } });
    await tx.contaPagar.update({
      where: { id: params.id },
      data: { valorPago: 0, valorMulta: 0, valorJuros: 0, dataPagamento: null, formaPagamento: null, status: "ABERTA" },
    });
    // Mudou o financeiro do pedido de compra → recomputa o status (espelho do que
    // o estorno de contas a receber faz com recomputarStatusPedido).
    if (conta.pedidoCompraId) await recomputarStatusFinanceiroCompra(tx, conta.pedidoCompraId);
    // Desfaz a contabilização do pagamento DENTRO da transação (atômico).
    await apagarLancamentosContabeis({ empresaId: conta.empresaId, origemTipo: "PAGAMENTO", origemId: params.id }, tx);
    return { erro: null, antecipado: conta.antecipado, pedidoCompraId: conta.pedidoCompraId } as const;
  });

  if (result.erro) return NextResponse.json({ error: result.erro.msg }, { status: result.erro.status });

  // Título antecipado (PA) com entrada já concluída: a entrada creditou a conta de
  // Adiantamento a Fornecedores contando com este pagamento — estornado o pagamento,
  // re-sincroniza a contabilização da entrada (deixa de liquidar um adiantamento
  // que não existe mais). Best-effort, pós-commit (contabilizarEntradaEstoque é
  // idempotente e lê o estado atual dos PAs).
  if (result.antecipado && result.pedidoCompraId) {
    const conf = await prisma.conferenciaCompra.findFirst({
      where: { pedidoId: result.pedidoCompraId, status: "CONCLUIDA" },
      select: { id: true },
    });
    if (conf) await contabilizarEntradaEstoque(conf.id).catch((e) => console.error("[contas-pagar/estorno] contabilizar entrada:", e));
  }

  return NextResponse.json({ ok: true });
}
