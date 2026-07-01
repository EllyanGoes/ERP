export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { apagarLancamentosContabeis } from "@/lib/contabilidade";

// Estorna o pagamento de um título a pagar: remove os lançamentos de caixa/banco,
// volta o título para ABERTA (zera o pago) e desfaz a contabilização do pagamento.
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
    // Desfaz a contabilização do pagamento DENTRO da transação (atômico).
    await apagarLancamentosContabeis({ empresaId: conta.empresaId, origemTipo: "PAGAMENTO", origemId: params.id }, tx);
    return { erro: null } as const;
  });

  if (result.erro) return NextResponse.json({ error: result.erro.msg }, { status: result.erro.status });
  return NextResponse.json({ ok: true });
}
