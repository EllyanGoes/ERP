export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { economiaDesconto, filtroVisibilidade } from "@/lib/processos";
import { CHAVE_DEPOSITO, resumoFinanceiroProcessos, temFinanceiro } from "@/lib/processos-pagamento";

const n = (v: unknown) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const DIA = 86_400_000;

// GET /api/processos/painel-financeiro — cartões de dinheiro do painel (§8.3): a pagar em processos
// (vencidos + próximos 30 dias), pago no ano, depositado em juízo (saldo) e economia possível com
// desconto por pagamento antecipado (próximos 30 dias). Mesmo recorte do painel: processos VISÍVEIS
// (confidencial) da empresa ativa/grupo (cliente escopado). Valores só para quem tem o Financeiro.
export async function GET() {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await temFinanceiro(auth.session))) return NextResponse.json({ podeVer: false });
  const visivel = await filtroVisibilidade(auth.session);
  const procs = await prisma.processo.findMany({ where: { AND: [visivel] }, select: { id: true, codigo: true, titulo: true } });
  const ids = procs.map((p) => p.id);
  const porId = new Map(procs.map((p) => [p.id, p]));
  const hoje = new Date(new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10) + "T00:00:00.000Z");
  const em30 = new Date(hoje.getTime() + 31 * DIA); // exclusivo: inclui o 30º dia
  const inicioAno = new Date(Date.UTC(hoje.getUTCFullYear(), 0, 1));
  if (!ids.length) return NextResponse.json({ podeVer: true, aPagar30: 0, aPagarVencido: 0, aPagarQtd: 0, pagoAno: 0, depositado: 0, economia30: 0, descontos: [] });

  const [abertos, caixaAno, convertidosAno, resumo, prazosDesc] = await Promise.all([
    prismaSemEscopo.contaPagar.findMany({
      where: { processoId: { in: ids }, status: { in: ["ABERTA", "PARCIAL"] }, dataVencimento: { lt: em30 } },
      select: { valorOriginal: true, valorPago: true, dataVencimento: true },
    }),
    prismaSemEscopo.lancamentoFinanceiro.findMany({
      where: { tipo: "DESPESA", dataLancamento: { gte: inicioAno }, contaPagar: { processoId: { in: ids }, status: { not: "CANCELADA" }, NOT: { naturezaFinanceira: { sistemaChave: CHAVE_DEPOSITO } } } },
      select: { valor: true },
    }),
    prismaSemEscopo.processoDepositoDestino.findMany({ where: { processoId: { in: ids }, tipo: "CONVERTIDO", data: { gte: inicioAno } }, select: { valor: true } }),
    resumoFinanceiroProcessos(ids),
    prismaSemEscopo.processoPrazo.findMany({
      where: { processoId: { in: ids }, status: "PENDENTE", descontoAte: { gte: hoje, lt: em30 } },
      orderBy: { descontoAte: "asc" },
      select: { id: true, processoId: true, descricao: true, descontoAte: true, valorPagar: true, valorComDesconto: true, contaPagar: { select: { id: true, numero: true } } },
    }),
  ]);
  const saldo = (t: { valorOriginal: unknown; valorPago: unknown }) => n(t.valorOriginal) - n(t.valorPago);
  const descontos = prazosDesc
    .map((p) => ({ ...p, economia: economiaDesconto(p), processo: porId.get(p.processoId) ?? null }))
    .filter((p) => p.economia != null);
  return NextResponse.json({
    podeVer: true,
    aPagar30: r2(abertos.reduce((s, t) => s + saldo(t), 0)),
    aPagarVencido: r2(abertos.filter((t) => t.dataVencimento && t.dataVencimento < hoje).reduce((s, t) => s + saldo(t), 0)),
    aPagarQtd: abertos.length,
    pagoAno: r2(caixaAno.reduce((s, l) => s + n(l.valor), 0) + convertidosAno.reduce((s, d) => s + n(d.valor), 0)),
    depositado: r2(Array.from(resumo.values()).reduce((s, r) => s + r.depositado, 0)),
    economia30: r2(descontos.reduce((s, p) => s + (p.economia ?? 0), 0)),
    descontos,
  });
}
