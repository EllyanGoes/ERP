export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";

const GRUPOS = ["RECEITA_OPERACIONAL", "CUSTO_OPERACIONAL", "DESPESA_OPERACIONAL", "INVESTIMENTO", "FINANCIAMENTO"] as const;
type Grupo = (typeof GRUPOS)[number];

const z12 = () => Array.from({ length: 12 }, () => 0);

// Relatório anual de fluxo de caixa (estilo DRE), por natureza → mês, em dois
// modos: PREVISTO agrega os títulos pelo mês de VENCIMENTO com o valor original
// (projeção, igual ao restante da tela); REALIZADO agrega o caixa EFETIVO — os
// lançamentos de caixa (baixas e avulsos) pela data em que o dinheiro entrou/saiu.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const ano = parseInt(searchParams.get("ano") || `${new Date().getFullYear()}`, 10);
  const modo = searchParams.get("modo") === "realizado" ? "realizado" : "previsto";
  const inicio = new Date(ano, 0, 1);
  const fim = new Date(ano + 1, 0, 1);

  const [naturezas, subgrupos] = await Promise.all([
    prisma.naturezaFinanceira.findMany({
      select: { id: true, nome: true, tipo: true, grupo: true, subgrupoId: true, ativo: true },
      orderBy: { nome: "asc" },
    }),
    prisma.naturezaSubgrupo.findMany({
      select: { id: true, nome: true, grupo: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  // valor com sinal: ENTRADA soma, SAIDA subtrai. AMBOS (transferências/contas
  // de terceiros) agrega pelo lado do título, mas neste mapa por natureza a
  // magnitude entra positiva — trata como entrada (neutra no líquido do par).
  const sinal = (tipo: "ENTRADA" | "SAIDA" | "AMBOS") => (tipo === "SAIDA" ? -1 : 1);
  const tipoNat = new Map(naturezas.map((n) => [n.id, n.tipo]));

  // Valor mensal por natureza. No PREVISTO é a magnitude (sempre positiva) — o
  // sinal entra depois pelo tipo da natureza. No REALIZADO o armazenado é
  // pré-dividido pelo sinal, para que (armazenado × sinal) devolva o valor COM o
  // sinal do próprio lançamento (um estorno aparece abatendo, não somando).
  const porNatureza = new Map<string, number[]>();

  if (modo === "previsto") {
    const [cr, cp] = await Promise.all([
      prisma.contaReceber.findMany({
        // Título com natureza única OU com rateio por natureza (split) — o split
        // pode existir mesmo sem a natureza principal preenchida.
        where: {
          status: { notIn: ["CANCELADA"] }, dataVencimento: { gte: inicio, lt: fim },
          OR: [{ naturezaFinanceiraId: { not: null } }, { naturezas: { some: {} } }],
        },
        select: { naturezaFinanceiraId: true, dataVencimento: true, valorOriginal: true, naturezas: { select: { naturezaFinanceiraId: true, valor: true } } },
      }),
      prisma.contaPagar.findMany({
        where: {
          status: { notIn: ["CANCELADA"] }, dataVencimento: { gte: inicio, lt: fim },
          OR: [{ naturezaFinanceiraId: { not: null } }, { naturezas: { some: {} } }],
        },
        select: { naturezaFinanceiraId: true, dataVencimento: true, valorOriginal: true, naturezas: { select: { naturezaFinanceiraId: true, valor: true } } },
      }),
    ]);

    const acumula = (natId: string | null, venc: Date | null, valor: { toString(): string }) => {
      if (!natId || !venc) return;
      const arr = porNatureza.get(natId) ?? z12();
      arr[venc.getMonth()] += parseFloat(valor.toString());
      porNatureza.set(natId, arr);
    };
    // RATEIO por natureza (split da baixa/criação) manda quando existe — cada
    // linha vai para a própria natureza; sem split, a natureza única do título.
    for (const c of [...cr, ...cp]) {
      if (c.naturezas.length > 0) for (const l of c.naturezas) acumula(l.naturezaFinanceiraId, c.dataVencimento, l.valor);
      else acumula(c.naturezaFinanceiraId, c.dataVencimento, c.valorOriginal);
    }
  } else {
    // REALIZADO: cada lançamento de caixa (baixa de título ou avulso) na data em
    // que aconteceu; transferências ficam de fora. O rateio por natureza do
    // título divide o valor do lançamento proporcionalmente às fatias; sem
    // rateio vale a natureza do lançamento (fallback: a natureza do título).
    const lans = await prisma.lancamentoFinanceiro.findMany({
      where: { tipo: { in: ["RECEITA", "DESPESA"] }, dataLancamento: { gte: inicio, lt: fim } },
      select: {
        tipo: true, valor: true, dataLancamento: true, naturezaFinanceiraId: true,
        contaPagar: { select: { naturezaFinanceiraId: true, naturezas: { select: { naturezaFinanceiraId: true, valor: true } } } },
        contaReceber: { select: { naturezaFinanceiraId: true, naturezas: { select: { naturezaFinanceiraId: true, valor: true } } } },
      },
    });

    const acumulaSigned = (natId: string | null | undefined, data: Date, valorSigned: number) => {
      if (!natId) return;
      const arr = porNatureza.get(natId) ?? z12();
      arr[data.getMonth()] += valorSigned * sinal(tipoNat.get(natId) ?? "ENTRADA");
      porNatureza.set(natId, arr);
    };
    for (const l of lans) {
      const valorSigned = parseFloat(l.valor.toString()) * (l.tipo === "DESPESA" ? -1 : 1);
      const titulo = l.contaPagar ?? l.contaReceber;
      const split = titulo?.naturezas ?? [];
      const totalSplit = split.reduce((s, x) => s + parseFloat(x.valor.toString()), 0);
      if (split.length > 0 && totalSplit > 0) {
        for (const x of split) acumulaSigned(x.naturezaFinanceiraId, l.dataLancamento, valorSigned * (parseFloat(x.valor.toString()) / totalSplit));
      } else {
        acumulaSigned(l.naturezaFinanceiraId ?? titulo?.naturezaFinanceiraId, l.dataLancamento, valorSigned);
      }
    }
  }

  type NatNode = { id: string; nome: string; tipo: "ENTRADA" | "SAIDA" | "AMBOS"; ativo: boolean; meses: number[]; total: number; temMovimento: boolean };
  type SubNode = { id: string | null; nome: string | null; naturezas: NatNode[] };
  type GrupoNode = { grupo: Grupo; meses: number[]; total: number; subgrupos: SubNode[] };

  const natNode = (n: typeof naturezas[number]): NatNode => {
    const mag = porNatureza.get(n.id) ?? z12();
    const meses = mag.map((v) => v * sinal(n.tipo));
    const total = meses.reduce((s, v) => s + v, 0);
    return { id: n.id, nome: n.nome, tipo: n.tipo, ativo: n.ativo, meses, total, temMovimento: mag.some((v) => v !== 0) };
  };
  // Exibe a natureza se está ATIVA no plano ou se tem movimento no ano — as
  // inativas paradas (plano antigo, mesmo nome da sucessora) ficam de fora,
  // senão a lista mostra "repetidas".
  const exibe = (n: NatNode) => n.ativo || n.temMovimento;

  const grupos: GrupoNode[] = GRUPOS.map((g) => {
    const natsDoGrupo = naturezas.filter((n) => n.grupo === g);
    const subs = subgrupos.filter((s) => s.grupo === g);
    const subgruposNode: SubNode[] = [];
    for (const s of subs) {
      const nats = natsDoGrupo.filter((n) => n.subgrupoId === s.id).map(natNode).filter(exibe);
      subgruposNode.push({ id: s.id, nome: s.nome, naturezas: nats });
    }
    const semSub = natsDoGrupo.filter((n) => !n.subgrupoId).map(natNode).filter(exibe);
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
    modo,
    grupos,
    resumo: {
      saldoInicial, receitaOperacional, custoOperacional, margemContribuicao,
      despesaOperacional, resultadoOperacional, investimento, financiamento,
      variacaoCaixa, saldoFinal,
    },
  });
}
