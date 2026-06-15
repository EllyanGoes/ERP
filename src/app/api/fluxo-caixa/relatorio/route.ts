export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";

const GRUPOS = ["RECEITA_OPERACIONAL", "CUSTO_OPERACIONAL", "DESPESA_OPERACIONAL", "INVESTIMENTO", "FINANCIAMENTO"] as const;
type Grupo = (typeof GRUPOS)[number];

const z12 = () => Array.from({ length: 12 }, () => 0);

// Relatório anual de fluxo de caixa (estilo DRE), agregando os títulos por
// natureza → mês de vencimento. Projeção pelo valor original (regime de
// competência da projeção), igual ao restante da tela de Fluxo de Caixa.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const ano = parseInt(searchParams.get("ano") || `${new Date().getFullYear()}`, 10);
  const inicio = new Date(ano, 0, 1);
  const fim = new Date(ano + 1, 0, 1);

  const [naturezas, subgrupos, cr, cp] = await Promise.all([
    prisma.naturezaFinanceira.findMany({
      select: { id: true, nome: true, tipo: true, grupo: true, subgrupoId: true, ativo: true },
      orderBy: { nome: "asc" },
    }),
    prisma.naturezaSubgrupo.findMany({
      select: { id: true, nome: true, grupo: true },
      orderBy: { nome: "asc" },
    }),
    prisma.contaReceber.findMany({
      where: { status: { notIn: ["CANCELADA"] }, naturezaFinanceiraId: { not: null }, dataVencimento: { gte: inicio, lt: fim } },
      select: { naturezaFinanceiraId: true, dataVencimento: true, valorOriginal: true },
    }),
    prisma.contaPagar.findMany({
      where: { status: { notIn: ["CANCELADA"] }, naturezaFinanceiraId: { not: null }, dataVencimento: { gte: inicio, lt: fim } },
      select: { naturezaFinanceiraId: true, dataVencimento: true, valorOriginal: true },
    }),
  ]);

  // valor mensal (magnitude, sempre positivo) por natureza
  const porNatureza = new Map<string, number[]>();
  const acumula = (natId: string | null, venc: Date | null, valor: { toString(): string }) => {
    if (!natId || !venc) return;
    const arr = porNatureza.get(natId) ?? z12();
    arr[venc.getMonth()] += parseFloat(valor.toString());
    porNatureza.set(natId, arr);
  };
  for (const c of cr) acumula(c.naturezaFinanceiraId, c.dataVencimento, c.valorOriginal);
  for (const c of cp) acumula(c.naturezaFinanceiraId, c.dataVencimento, c.valorOriginal);

  // valor com sinal: ENTRADA soma, SAIDA subtrai
  const sinal = (tipo: "ENTRADA" | "SAIDA") => (tipo === "ENTRADA" ? 1 : -1);

  type NatNode = { id: string; nome: string; tipo: "ENTRADA" | "SAIDA"; meses: number[]; total: number; temMovimento: boolean };
  type SubNode = { id: string | null; nome: string | null; naturezas: NatNode[] };
  type GrupoNode = { grupo: Grupo; meses: number[]; total: number; subgrupos: SubNode[] };

  const natNode = (n: typeof naturezas[number]): NatNode => {
    const mag = porNatureza.get(n.id) ?? z12();
    const meses = mag.map((v) => v * sinal(n.tipo));
    const total = meses.reduce((s, v) => s + v, 0);
    return { id: n.id, nome: n.nome, tipo: n.tipo, meses, total, temMovimento: mag.some((v) => v !== 0) };
  };

  const grupos: GrupoNode[] = GRUPOS.map((g) => {
    const natsDoGrupo = naturezas.filter((n) => n.grupo === g);
    const subs = subgrupos.filter((s) => s.grupo === g);
    const subgruposNode: SubNode[] = [];
    for (const s of subs) {
      const nats = natsDoGrupo.filter((n) => n.subgrupoId === s.id).map(natNode).filter((n) => n.temMovimento || n.tipo);
      subgruposNode.push({ id: s.id, nome: s.nome, naturezas: nats });
    }
    const semSub = natsDoGrupo.filter((n) => !n.subgrupoId).map(natNode);
    if (semSub.length) subgruposNode.push({ id: null, nome: null, naturezas: semSub });
    const meses = z12();
    for (const sub of subgruposNode) for (const n of sub.naturezas) for (let m = 0; m < 12; m++) meses[m] += n.meses[m];
    return { grupo: g, meses, total: meses.reduce((s, v) => s + v, 0), subgrupos: subgruposNode };
  });

  const grupoMeses = (g: Grupo) => grupos.find((x) => x.grupo === g)?.meses ?? z12();
  const soma = (...arrs: number[][]) => z12().map((_, m) => arrs.reduce((s, a) => s + a[m], 0));

  const receitaOperacional = grupoMeses("RECEITA_OPERACIONAL");
  const custoOperacional = grupoMeses("CUSTO_OPERACIONAL");
  const despesaOperacional = grupoMeses("DESPESA_OPERACIONAL");
  const investimento = grupoMeses("INVESTIMENTO");
  const financiamento = grupoMeses("FINANCIAMENTO");

  const margemContribuicao = soma(receitaOperacional, custoOperacional);
  const resultadoOperacional = soma(margemContribuicao, despesaOperacional);
  const variacaoCaixa = soma(resultadoOperacional, investimento, financiamento);

  const saldoInicial = z12();
  const saldoFinal = z12();
  let acc = 0;
  for (let m = 0; m < 12; m++) {
    saldoInicial[m] = acc;
    acc += variacaoCaixa[m];
    saldoFinal[m] = acc;
  }

  return NextResponse.json({
    ano,
    grupos,
    resumo: {
      saldoInicial, receitaOperacional, custoOperacional, margemContribuicao,
      despesaOperacional, resultadoOperacional, investimento, financiamento,
      variacaoCaixa, saldoFinal,
    },
  });
}
