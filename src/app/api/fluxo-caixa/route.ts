export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";

// Fluxo de caixa em dois modos:
//  - projetado (default): por data de VENCIMENTO (o que está previsto entrar/sair).
//  - realizado: por data de PAGAMENTO/RECEBIMENTO de fato (LancamentoFinanceiro),
//    excluindo transferências entre contas próprias (não são entrada/saída real).
export async function GET(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const modo = req.nextUrl.searchParams.get("modo") === "realizado" ? "realizado" : "projetado";
  const map = new Map<string, { receitas: number; despesas: number; recebido: number; pago: number; repasseCartao: number }>();

  if (modo === "realizado") {
    const lfs = await prisma.lancamentoFinanceiro.findMany({
      // Exclui transferências e as baixas da transitória de compensação (não é caixa).
      where: { transferenciaParId: null, contaBancaria: { compensacao: false, permuta: false } },
      select: { dataLancamento: true, tipo: true, valor: true },
    });
    for (const lf of lfs) {
      const key = lf.dataLancamento.toISOString().split("T")[0];
      const entry = map.get(key) ?? { receitas: 0, despesas: 0, recebido: 0, pago: 0, repasseCartao: 0 };
      const v = parseFloat(lf.valor.toString());
      if (lf.tipo === "RECEITA") { entry.receitas += v; entry.recebido += v; }
      else { entry.despesas += v; entry.pago += v; }
      map.set(key, entry);
    }
  } else {
    const [cr, cp] = await Promise.all([
      prisma.contaReceber.findMany({
        where: { status: { notIn: ["CANCELADA"] } },
        select: { dataVencimento: true, valorOriginal: true, valorPago: true, status: true },
        orderBy: { dataVencimento: "asc" },
      }),
      prisma.contaPagar.findMany({
        where: { status: { notIn: ["CANCELADA"] } },
        select: { dataVencimento: true, valorOriginal: true, valorPago: true, status: true },
        orderBy: { dataVencimento: "asc" },
      }),
    ]);
    for (const c of cr) {
      if (!c.dataVencimento) continue; // sem data prevista → fora da projeção de fluxo
      const key = c.dataVencimento.toISOString().split("T")[0];
      const entry = map.get(key) ?? { receitas: 0, despesas: 0, recebido: 0, pago: 0, repasseCartao: 0 };
      entry.receitas += parseFloat(c.valorOriginal.toString());
      entry.recebido += parseFloat(c.valorPago.toString());
      map.set(key, entry);
    }
    for (const c of cp) {
      if (!c.dataVencimento) continue;
      const key = c.dataVencimento.toISOString().split("T")[0];
      const entry = map.get(key) ?? { receitas: 0, despesas: 0, recebido: 0, pago: 0, repasseCartao: 0 };
      entry.despesas += parseFloat(c.valorOriginal.toString());
      entry.pago += parseFloat(c.valorPago.toString());
      map.set(key, entry);
    }

    // Repasses de cartão previstos (INFORMATIVO — campo próprio, fora do saldo:
    // a CR da venda no cartão já entrou como receita no vencimento; somar o
    // repasse de novo dobraria). Fonte: LFs ainda não conciliados nas contas das
    // administradoras (tipo CARTAO), projetados em dataLancamento +
    // diasCompensacao da maquineta (fallback: maior prazo cadastrado).
    const lfsCartao = await prisma.lancamentoFinanceiro.findMany({
      where: { tipo: "RECEITA", conciliado: false, contaBancaria: { tipo: "CARTAO" } },
      select: { valor: true, dataLancamento: true, maquinetaId: true },
    });
    if (lfsCartao.length > 0) {
      const taxas = await prisma.taxaMaquineta.findMany({
        select: { maquinetaId: true, diasCompensacao: true },
      });
      const diasPorMaquineta = new Map<string, number>();
      let maiorPrazo = 0;
      for (const t of taxas) {
        diasPorMaquineta.set(t.maquinetaId, Math.max(diasPorMaquineta.get(t.maquinetaId) ?? 0, t.diasCompensacao));
        maiorPrazo = Math.max(maiorPrazo, t.diasCompensacao);
      }
      for (const lf of lfsCartao) {
        const dias = (lf.maquinetaId ? diasPorMaquineta.get(lf.maquinetaId) : undefined) ?? maiorPrazo;
        const prevista = new Date(lf.dataLancamento.getTime() + dias * 86400000);
        const key = prevista.toISOString().split("T")[0];
        const entry = map.get(key) ?? { receitas: 0, despesas: 0, recebido: 0, pago: 0, repasseCartao: 0 };
        entry.repasseCartao += parseFloat(lf.valor.toString());
        map.set(key, entry);
      }
    }
  }

  let saldoAcumulado = 0;
  const result = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, vals]) => {
      saldoAcumulado += vals.receitas - vals.despesas;
      return { data, ...vals, saldo: saldoAcumulado };
    });

  return NextResponse.json({ data: result });
}
