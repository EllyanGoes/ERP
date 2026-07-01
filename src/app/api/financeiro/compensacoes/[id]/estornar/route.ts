export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { decimalToNumber } from "@/lib/utils";
import { recontabilizarTituloReceber, recontabilizarTituloPagar, apagarLancamentosContabeis } from "@/lib/contabilidade";

const r2 = (n: number) => Math.round(n * 100) / 100;
const novoStatus = (valorOriginal: number, valorPago: number) =>
  valorOriginal - valorPago <= 0.005 ? "PAGA" : valorPago > 0.005 ? "PARCIAL" : "ABERTA";

// Estorna uma compensação CONFIRMADA: apaga as baixas da transitória, devolve os
// saldos aos títulos originais, cancela o título-resíduo e desfaz a contabilização.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;

  const comp = await prismaSemEscopo.compensacao.findFirst({
    where: { id: params.id, empresaId },
    select: {
      id: true, status: true,
      itens: { select: { id: true, tipo: true, contaReceberId: true, contaPagarId: true, valorAplicado: true, lancamentoFinanceiroId: true, juros: true, multa: true } },
      residuosReceber: { select: { id: true, valorPago: true, status: true } },
      residuosPagar: { select: { id: true, valorPago: true, status: true } },
    },
  });
  if (!comp) return NextResponse.json({ error: "Compensação não encontrada" }, { status: 404 });
  if (comp.status !== "CONFIRMADA") return NextResponse.json({ error: "Só é possível estornar uma compensação confirmada." }, { status: 409 });

  // Bloqueia se o resíduo já teve movimento (pagamento/nova compensação).
  const residuoComMovimento =
    comp.residuosReceber.some((r) => decimalToNumber(r.valorPago) > 0.005 || r.status !== "ABERTA") ||
    comp.residuosPagar.some((r) => decimalToNumber(r.valorPago) > 0.005 || r.status !== "ABERTA");
  if (residuoComMovimento) {
    return NextResponse.json({ error: "O título-resíduo já teve movimento; estorne-o antes." }, { status: 409 });
  }

  const afetadosR = new Set<string>();
  const afetadosP = new Set<string>();
  const residuos: { tipo: "RECEBER" | "PAGAR"; id: string }[] = [
    ...comp.residuosReceber.map((r) => ({ tipo: "RECEBER" as const, id: r.id })),
    ...comp.residuosPagar.map((r) => ({ tipo: "PAGAR" as const, id: r.id })),
  ];

  await prismaSemEscopo.$transaction(async (tx) => {
    for (const it of comp.itens) {
      const aplicado = decimalToNumber(it.valorAplicado);
      const juros = decimalToNumber(it.juros);
      const multa = decimalToNumber(it.multa);
      if (it.tipo === "RECEBER" && it.contaReceberId) {
        const cr = await tx.contaReceber.findUnique({ where: { id: it.contaReceberId }, select: { valorOriginal: true, valorPago: true, valorJuros: true, valorMulta: true } });
        if (cr) {
          const vp = Math.max(0, r2(decimalToNumber(cr.valorPago) - aplicado));
          await tx.contaReceber.update({ where: { id: it.contaReceberId }, data: { valorPago: vp, valorJuros: Math.max(0, r2(decimalToNumber(cr.valorJuros) - juros)), valorMulta: Math.max(0, r2(decimalToNumber(cr.valorMulta) - multa)), status: novoStatus(decimalToNumber(cr.valorOriginal), vp), dataPagamento: vp <= 0.005 ? null : undefined } });
        }
        afetadosR.add(it.contaReceberId);
      } else if (it.tipo === "PAGAR" && it.contaPagarId) {
        const cp = await tx.contaPagar.findUnique({ where: { id: it.contaPagarId }, select: { valorOriginal: true, valorPago: true, valorJuros: true, valorMulta: true } });
        if (cp) {
          const vp = Math.max(0, r2(decimalToNumber(cp.valorPago) - aplicado));
          await tx.contaPagar.update({ where: { id: it.contaPagarId }, data: { valorPago: vp, valorJuros: Math.max(0, r2(decimalToNumber(cp.valorJuros) - juros)), valorMulta: Math.max(0, r2(decimalToNumber(cp.valorMulta) - multa)), status: novoStatus(decimalToNumber(cp.valorOriginal), vp), dataPagamento: vp <= 0.005 ? null : undefined } });
        }
        afetadosP.add(it.contaPagarId);
      }
      // Desfaz a contabilização do ajuste deste item (juros/multa/desconto).
      await apagarLancamentosContabeis({ empresaId, origemTipo: "COMPENSACAO_AJUSTE", origemId: it.id }, tx);
      // Remove a baixa da transitória (limpa o FK do item antes de apagar o LF).
      if (it.lancamentoFinanceiroId) {
        await tx.compensacaoItem.update({ where: { id: it.id }, data: { lancamentoFinanceiroId: null } });
        await tx.lancamentoFinanceiro.delete({ where: { id: it.lancamentoFinanceiroId } }).catch(() => null);
      }
    }

    // Cancela o título-resíduo e desfaz sua contabilização (reclass) dentro da transação.
    for (const r of comp.residuosReceber) {
      await tx.contaReceber.update({ where: { id: r.id }, data: { status: "CANCELADA" } });
      await apagarLancamentosContabeis({ empresaId, origemTipo: { in: ["VENDA", "RECEBIMENTO"] }, origemId: r.id }, tx);
    }
    for (const r of comp.residuosPagar) {
      await tx.contaPagar.update({ where: { id: r.id }, data: { status: "CANCELADA" } });
      await apagarLancamentosContabeis({ empresaId, origemTipo: { in: ["COMPRA", "PAGAMENTO"] }, origemId: r.id }, tx);
    }

    await tx.compensacao.update({ where: { id: comp.id }, data: { status: "ESTORNADA" } });
  });

  // Recontabiliza os originais a partir do estado revertido (remove D Forn/C Cli).
  for (const id of Array.from(afetadosR)) await recontabilizarTituloReceber(id).catch(() => null);
  for (const id of Array.from(afetadosP)) await recontabilizarTituloPagar(id).catch(() => null);
  // Resíduos cancelados: recontabilizar remove qualquer lançamento remanescente.
  for (const r of residuos) {
    if (r.tipo === "RECEBER") await recontabilizarTituloReceber(r.id).catch(() => null);
    else await recontabilizarTituloPagar(r.id).catch(() => null);
  }

  return NextResponse.json({ ok: true });
}
