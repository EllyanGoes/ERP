export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { consolidarPosicoes, requireInvestimentos } from "@/lib/investimentos";

// GET /api/investimentos/carteira — carteira consolidada + operações e
// proventos do usuário logado (uma chamada alimenta a tela toda).
export async function GET() {
  const auth = await requireInvestimentos();
  if (!auth.ok) return auth.response;
  const usuarioId = auth.session.sub;

  const [operacoes, proventos] = await Promise.all([
    prismaSemEscopo.investOperacao.findMany({
      where: { usuarioId },
      orderBy: [{ data: "asc" }, { createdAt: "asc" }],
      include: { ativo: { select: { id: true, ticker: true, nome: true, tipo: true, precoAtual: true, precoAtualizadoEm: true } } },
    }),
    prismaSemEscopo.investProvento.findMany({
      where: { usuarioId },
      orderBy: { data: "desc" },
      include: { ativo: { select: { id: true, ticker: true, nome: true, tipo: true, precoAtual: true, precoAtualizadoEm: true } } },
    }),
  ]);

  const ativos = new Map<string, { id: string; ticker: string; nome: string | null; tipo: string; precoAtual: unknown; precoAtualizadoEm: Date | null }>();
  for (const o of operacoes) ativos.set(o.ativo.id, o.ativo);
  for (const p of proventos) ativos.set(p.ativo.id, p.ativo);

  const posicoes = consolidarPosicoes(operacoes, proventos, ativos);

  // ── Série mensal p/ os gráficos ─────────────────────────────────────────
  // "investido" = custo acumulado ao fim de cada mês (compra soma custo+taxas,
  // venda baixa ao preço médio — mesma regra da consolidação); "proventos" =
  // recebidos no mês. Sem preços históricos, o patrimônio a mercado só existe
  // no presente (cards) — a série usa o custo, que é exato.
  const series: { mes: string; investido: number; proventos: number }[] = [];
  if (operacoes.length > 0 || proventos.length > 0) {
    const provPorMes = new Map<string, number>();
    for (const p of proventos) {
      const ym = p.data.toISOString().slice(0, 7);
      provPorMes.set(ym, (provPorMes.get(ym) ?? 0) + Number(p.valor));
    }
    const primeira = new Date(Math.min(
      ...operacoes.map((o) => o.data.getTime()),
      ...proventos.map((p) => p.data.getTime()),
    ));
    const estado = new Map<string, { qtd: number; custo: number }>();
    let investido = 0;
    let i = 0;
    let ano = primeira.getUTCFullYear(), mes = primeira.getUTCMonth();
    const agora = new Date();
    const fimAno = agora.getUTCFullYear(), fimMes = agora.getUTCMonth();
    while (ano < fimAno || (ano === fimAno && mes <= fimMes)) {
      const fimDoMes = new Date(Date.UTC(ano, mes + 1, 1));
      while (i < operacoes.length && operacoes[i].data < fimDoMes) {
        const op = operacoes[i++];
        const s = estado.get(op.ativoId) ?? { qtd: 0, custo: 0 };
        const q = Number(op.quantidade), preco = Number(op.preco), custos = Number(op.custos);
        if (op.tipo === "COMPRA") {
          const delta = q * preco + custos;
          s.custo += delta; s.qtd += q; investido += delta;
        } else {
          const pm = s.qtd > 0 ? s.custo / s.qtd : 0;
          const delta = pm * q;
          s.custo -= delta; s.qtd -= q; investido -= delta;
          if (s.qtd <= 1e-9) { investido -= s.custo; s.qtd = 0; s.custo = 0; }
        }
        estado.set(op.ativoId, s);
      }
      const ym = `${ano}-${String(mes + 1).padStart(2, "0")}`;
      series.push({ mes: ym, investido, proventos: provPorMes.get(ym) ?? 0 });
      mes++; if (mes > 11) { mes = 0; ano++; }
      if (series.length >= 120) break; // trava de sanidade (10 anos)
    }
  }

  const totais = posicoes.reduce(
    (t, p) => ({
      custo: t.custo + p.custoTotal,
      valor: t.valor + (p.valorAtual ?? p.custoTotal),
      resultado: t.resultado + (p.resultado ?? 0),
      realizado: t.realizado + p.realizadoRs,
      proventos: t.proventos + p.proventosRs,
    }),
    { custo: 0, valor: 0, resultado: 0, realizado: 0, proventos: 0 },
  );

  return NextResponse.json({
    data: {
      posicoes,
      totais,
      series,
      operacoes: [...operacoes].reverse().map((o) => ({
        id: o.id, ticker: o.ativo.ticker, tipo: o.tipo, data: o.data.toISOString(),
        quantidade: Number(o.quantidade), preco: Number(o.preco), custos: Number(o.custos),
        importada: !!o.chaveImport,
      })),
      proventos: proventos.map((p) => ({
        id: p.id, ticker: p.ativo.ticker, tipo: p.tipo, data: p.data.toISOString(),
        valor: Number(p.valor), importada: !!p.chaveImport,
      })),
    },
  });
}
