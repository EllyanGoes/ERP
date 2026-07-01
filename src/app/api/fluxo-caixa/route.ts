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
  const map = new Map<string, { receitas: number; despesas: number; recebido: number; pago: number }>();

  if (modo === "realizado") {
    const lfs = await prisma.lancamentoFinanceiro.findMany({
      where: { transferenciaParId: null },
      select: { dataLancamento: true, tipo: true, valor: true },
    });
    for (const lf of lfs) {
      const key = lf.dataLancamento.toISOString().split("T")[0];
      const entry = map.get(key) ?? { receitas: 0, despesas: 0, recebido: 0, pago: 0 };
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
      const entry = map.get(key) ?? { receitas: 0, despesas: 0, recebido: 0, pago: 0 };
      entry.receitas += parseFloat(c.valorOriginal.toString());
      entry.recebido += parseFloat(c.valorPago.toString());
      map.set(key, entry);
    }
    for (const c of cp) {
      if (!c.dataVencimento) continue;
      const key = c.dataVencimento.toISOString().split("T")[0];
      const entry = map.get(key) ?? { receitas: 0, despesas: 0, recebido: 0, pago: 0 };
      entry.despesas += parseFloat(c.valorOriginal.toString());
      entry.pago += parseFloat(c.valorPago.toString());
      map.set(key, entry);
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
