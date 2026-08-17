// Investimentos pessoais (B3) — helpers do módulo standalone.
// REGRA DE OURO: toda consulta de operações/proventos filtra por usuarioId da
// sessão — nem perfil ADMIN enxerga a carteira de outro usuário.
import { NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { podeAcessarInvestimentos } from "@/lib/investimentos-acesso";
import type { RequireSessionResult } from "@/lib/auth";
import type { TipoInvestAtivo } from "@prisma/client";

/** Guard das rotas do módulo: exige o módulo E a allowlist de e-mails. */
export async function requireInvestimentos(): Promise<RequireSessionResult> {
  const auth = await requireModulo("investimentos");
  if (!auth.ok) return auth;
  if (!podeAcessarInvestimentos(auth.session.email)) {
    return { ok: false, response: NextResponse.json({ error: "Acesso restrito." }, { status: 403 }) };
  }
  return auth;
}

/** Normaliza o código de negociação (remove sufixo F do fracionário). */
export function normalizarTicker(raw: string): string {
  const t = raw.trim().toUpperCase();
  return /^[A-Z]{4}\d{1,2}F$/.test(t) ? t.slice(0, -1) : t;
}

/** Heurística de tipo pelo sufixo (editável depois; ETF também termina em 11). */
export function tipoDoTicker(ticker: string): TipoInvestAtivo {
  if (/11$/.test(ticker)) return "FII";
  if (/3[2-5]$/.test(ticker)) return "BDR";
  if (/\d$/.test(ticker)) return "ACAO";
  return "OUTRO";
}

/** Busca ou cria o ativo pelo ticker (dado de mercado, compartilhado). */
export async function resolverAtivo(rawTicker: string) {
  const ticker = normalizarTicker(rawTicker);
  if (!/^[A-Z0-9]{4,10}$/.test(ticker)) return null;
  return prismaSemEscopo.investAtivo.upsert({
    where: { ticker },
    update: {},
    create: { ticker, tipo: tipoDoTicker(ticker) },
  });
}

export type PosicaoCarteira = {
  ativoId: string;
  ticker: string;
  nome: string | null;
  tipo: string;
  quantidade: number;
  precoMedio: number;
  custoTotal: number;
  precoAtual: number | null;
  precoAtualizadoEm: string | null;
  valorAtual: number | null;
  resultado: number | null;      // não realizado (valorAtual - custo)
  resultadoPct: number | null;
  realizadoRs: number;           // resultado de vendas (PM médio, padrão IR)
  proventosRs: number;
};

/**
 * Consolida a carteira do usuário: preço médio recalculado a cada compra,
 * venda baixa quantidade ao PM (resultado realizado no padrão do IR).
 */
export function consolidarPosicoes(
  operacoes: { ativoId: string; tipo: string; quantidade: unknown; preco: unknown; custos: unknown }[],
  proventos: { ativoId: string; valor: unknown }[],
  ativos: Map<string, { id: string; ticker: string; nome: string | null; tipo: string; precoAtual: unknown; precoAtualizadoEm: Date | null }>,
): PosicaoCarteira[] {
  const acc = new Map<string, { qtd: number; custo: number; realizado: number; proventos: number }>();
  const get = (id: string) => {
    if (!acc.has(id)) acc.set(id, { qtd: 0, custo: 0, realizado: 0, proventos: 0 });
    return acc.get(id)!;
  };
  for (const op of operacoes) {
    const p = get(op.ativoId);
    const q = Number(op.quantidade), preco = Number(op.preco), custos = Number(op.custos);
    if (op.tipo === "COMPRA") {
      p.custo += q * preco + custos;
      p.qtd += q;
    } else {
      const pm = p.qtd > 0 ? p.custo / p.qtd : 0;
      p.realizado += (preco - pm) * q - custos;
      p.custo -= pm * q;
      p.qtd -= q;
      if (p.qtd <= 1e-9) { p.qtd = 0; p.custo = 0; }
    }
  }
  for (const pr of proventos) get(pr.ativoId).proventos += Number(pr.valor);

  const posicoes: PosicaoCarteira[] = [];
  for (const [ativoId, p] of Array.from(acc.entries())) {
    const a = ativos.get(ativoId);
    if (!a) continue;
    const precoAtual = a.precoAtual != null ? Number(a.precoAtual) : null;
    const valorAtual = precoAtual != null ? p.qtd * precoAtual : null;
    const resultado = valorAtual != null ? valorAtual - p.custo : null;
    posicoes.push({
      ativoId,
      ticker: a.ticker,
      nome: a.nome,
      tipo: a.tipo,
      quantidade: p.qtd,
      precoMedio: p.qtd > 0 ? p.custo / p.qtd : 0,
      custoTotal: p.custo,
      precoAtual,
      precoAtualizadoEm: a.precoAtualizadoEm?.toISOString() ?? null,
      valorAtual,
      resultado,
      resultadoPct: resultado != null && p.custo > 0 ? (resultado / p.custo) * 100 : null,
      realizadoRs: p.realizado,
      proventosRs: p.proventos,
    });
  }
  // Posições abertas primeiro (maior valor), zeradas por último
  return posicoes.sort((x, y) => (y.valorAtual ?? y.custoTotal) - (x.valorAtual ?? x.custoTotal));
}
