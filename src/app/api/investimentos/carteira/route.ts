export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { consolidarPosicoes } from "@/lib/investimentos";

// GET /api/investimentos/carteira — carteira consolidada + operações e
// proventos do usuário logado (uma chamada alimenta a tela toda).
export async function GET() {
  const auth = await requireModulo("investimentos");
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
