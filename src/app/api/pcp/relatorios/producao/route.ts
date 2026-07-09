export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// GET /api/pcp/relatorios/producao?fluxoId=&from=&to=
// Produção ENTREGUE (etapas concluídas) agregada por ÁREA de produção: peças
// apontadas, perda e vagões/vagonetas por produto. Período/dia pelo DIA
// PROGRAMADO da OP (dataPrevistaInicio; fallback fimReal) — reapontamento
// retroativo conta no dia da produção. Quantidades em peças (unidade-base).
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const fluxoId = searchParams.get("fluxoId") || null;
  // Janela no fuso de Belém (UTC−3): o "dia" do filtro precisa bater com o dia
  // do gráfico (diaBelem) — sem isso, apontamentos da noite caíam no dia seguinte.
  const parse = (v: string | null, fim?: boolean) => {
    if (!v?.trim()) return null;
    const d = new Date(`${v}T${fim ? "23:59:59.999" : "00:00:00"}-03:00`);
    return isNaN(d.getTime()) ? null : d;
  };
  const from = parse(searchParams.get("from"));
  const to = parse(searchParams.get("to"), true);

  const where: Prisma.ItemOrdemProducaoWhereInput = { status: "CONCLUIDA" };
  // Período pelo DIA PROGRAMADO da OP (dataPrevistaInicio) — reapontamentos
  // retroativos contam no dia da produção, não no dia em que foram digitados.
  // OPs sem programação caem na data de conclusão (fimReal).
  if (from || to) {
    const range = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    where.OR = [
      { ordemProducao: { dataPrevistaInicio: range } },
      { ordemProducao: { dataPrevistaInicio: null }, fimReal: range },
    ];
  }
  if (fluxoId) where.ordemProducao = { fluxoVersao: { fluxo: { id: fluxoId } } };

  const etapas = await prisma.itemOrdemProducao.findMany({
    where,
    select: {
      nome: true, centroTrabalho: true, sequencia: true, fimReal: true,
      qtdPerda: true, vagoes: true, vagonetas: true, apontadoPor: true,
      ordemProducao: {
        select: {
          id: true, numero: true, dataPrevistaInicio: true,
          fluxoVersao: { select: { fluxo: { select: { id: true, nome: true } } } },
          produtoItens: {
            select: {
              itemId: true, quantidadeReal: true, unidadeId: true, qtdPerda: true,
              item: { select: { codigo: true, descricao: true, unidade: { select: { sigla: true } }, itemUnidades: { select: { unidadeId: true, isPrincipal: true, fatorConversao: true, unidade: { select: { sigla: true } } } } } },
            },
          },
        },
      },
    },
    orderBy: { fimReal: "asc" },
  });

  // `unidade` = unidade-base do produto (UN, LOTE, …) — Preparação/Mistura não
  // produzem em peças; a tabela mostra Quantidade + Unidade.
  type ProdutoAgg = { itemId: string; codigo: string; descricao: string; unidade: string | null; pecas: number; paletes: number; perda: number; ops: number };
  type AreaAgg = { area: string; sequencia: number; pecas: number; paletes: number; perda: number; vagoes: number; vagonetas: number; ops: number; produtos: Map<string, ProdutoAgg> };
  const areas = new Map<string, AreaAgg>();
  // Série diária por área (gráfico por data). Dia no fuso de Belém (UTC−3).
  const porDia = new Map<string, { dia: string; area: string; pecas: number; paletes: number; perda: number; veiculos: number }>();
  const diaBelem = (d: Date | null) => (d ? new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10) : null);
  const diaDe = (dia: string, area: string) => {
    const k = `${dia}|${area}`;
    return porDia.get(k) ?? porDia.set(k, { dia, area, pecas: 0, paletes: 0, perda: 0, veiculos: 0 }).get(k)!;
  };
  // Resumo por OP (pop-up do dia no gráfico): uma linha por etapa concluída.
  const opsDia: { dia: string; area: string; id: string; numero: string; hora: string | null; apontadoPor: string | null; pecas: number; paletes: number; perda: number; veiculos: number; produtos: string }[] = [];

  for (const et of etapas) {
    const chave = et.centroTrabalho ?? et.nome;
    let a = areas.get(chave);
    if (!a) { a = { area: chave, sequencia: et.sequencia, pecas: 0, paletes: 0, perda: 0, vagoes: 0, vagonetas: 0, ops: 0, produtos: new Map() }; areas.set(chave, a); }
    a.sequencia = Math.min(a.sequencia, et.sequencia);
    a.ops += 1;
    a.vagoes += et.vagoes ?? 0;
    a.vagonetas += et.vagonetas ?? 0;

    // Dia do gráfico = dia PROGRAMADO da OP (fallback: conclusão real). Veículos
    // descarregados contam uma vez por etapa — não por produto.
    const diaEtapa = diaBelem(et.ordemProducao.dataPrevistaInicio ?? et.fimReal);
    if (diaEtapa) diaDe(diaEtapa, chave).veiculos += (et.vagoes ?? 0) + (et.vagonetas ?? 0);

    let opPecas = 0, opPaletes = 0, opPerda = 0;
    const opProdutos: string[] = [];

    for (const pi of et.ordemProducao.produtoItens) {
      // Real na unidade da linha → peças (fator do ItemUnidade; principal = 1).
      const iu = pi.unidadeId ? pi.item.itemUnidades.find((u) => u.unidadeId === pi.unidadeId) : null;
      const fator = iu && !iu.isPrincipal && iu.fatorConversao != null && Number(iu.fatorConversao) > 0 ? Number(iu.fatorConversao) : 1;
      // Peças e paletes são UNIDADES: arredonda PARA CIMA (palete parcial conta como palete).
      const pecas = Math.ceil((Number(pi.quantidadeReal) || 0) * fator);
      const perda = Number(pi.qtdPerda) || 0;
      if (pecas <= 0 && perda <= 0) continue;
      // Paletes produzidos = peças ÷ peças/palete do produto (ItemUnidade PLT).
      const iuPlt = pi.item.itemUnidades.find((u) => /^PLT$/i.test(u.unidade?.sigla ?? "") && u.fatorConversao != null && Number(u.fatorConversao) > 0);
      const paletes = iuPlt ? Math.ceil(pecas / Number(iuPlt.fatorConversao)) : 0;
      a.pecas += pecas;
      a.paletes += paletes;
      a.perda += perda;
      let p = a.produtos.get(pi.itemId);
      if (!p) { p = { itemId: pi.itemId, codigo: pi.item.codigo, descricao: pi.item.descricao, unidade: pi.item.unidade?.sigla ?? null, pecas: 0, paletes: 0, perda: 0, ops: 0 }; a.produtos.set(pi.itemId, p); }
      p.pecas += pecas;
      p.paletes += paletes;
      p.perda += perda;
      p.ops += 1;

      if (diaEtapa) {
        const d = diaDe(diaEtapa, chave);
        d.pecas += pecas;
        d.paletes += paletes;
        d.perda += perda;
      }
      opPecas += pecas;
      opPaletes += paletes;
      opPerda += perda;
      opProdutos.push(`${Math.round(pecas).toLocaleString("pt-BR")}× ${pi.item.descricao}`);
    }

    if (diaEtapa) {
      opsDia.push({
        dia: diaEtapa, area: chave, id: et.ordemProducao.id, numero: et.ordemProducao.numero,
        hora: et.fimReal ? new Date(et.fimReal.getTime() - 3 * 3600 * 1000).toISOString().slice(11, 16) : null,
        apontadoPor: et.apontadoPor ?? null,
        pecas: Math.round(opPecas * 1000) / 1000, paletes: Math.round(opPaletes * 10) / 10, perda: Math.round(opPerda * 1000) / 1000,
        veiculos: (et.vagoes ?? 0) + (et.vagonetas ?? 0),
        produtos: opProdutos.join(" · "),
      });
    }
  }

  const round = (v: number) => Math.round(v * 1000) / 1000;
  const data = Array.from(areas.values())
    .sort((x, y) => x.sequencia - y.sequencia)
    .map((a) => ({
      area: a.area, sequencia: a.sequencia, ops: a.ops,
      pecas: round(a.pecas), paletes: Math.round(a.paletes * 10) / 10, perda: round(a.perda),
      vagoes: a.vagoes || null, vagonetas: a.vagonetas || null,
      produtos: Array.from(a.produtos.values())
        .sort((x, y) => y.pecas - x.pecas)
        .map((p) => ({ ...p, pecas: round(p.pecas), paletes: Math.round(p.paletes * 10) / 10, perda: round(p.perda) })),
    }));

  const dias = Array.from(porDia.values())
    .sort((x, y) => x.dia.localeCompare(y.dia))
    .map((d) => ({ ...d, pecas: round(d.pecas), paletes: Math.round(d.paletes * 10) / 10, perda: round(d.perda) }));

  return NextResponse.json({ data, porDia: dias, ops: opsDia });
}
