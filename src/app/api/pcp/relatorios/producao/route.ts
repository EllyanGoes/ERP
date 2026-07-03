export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// GET /api/pcp/relatorios/producao?fluxoId=&from=&to=
// Produção ENTREGUE (etapas concluídas) agregada por ÁREA de produção: peças
// apontadas, perda e vagões/vagonetas por produto. Período pela data de
// conclusão real da etapa (fimReal); quantidades sempre em peças (unidade-base).
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const fluxoId = searchParams.get("fluxoId") || null;
  const parse = (v: string | null, fim?: boolean) => {
    if (!v?.trim()) return null;
    const d = new Date(`${v}T${fim ? "23:59:59.999" : "00:00:00"}`);
    return isNaN(d.getTime()) ? null : d;
  };
  const from = parse(searchParams.get("from"));
  const to = parse(searchParams.get("to"), true);

  const where: Prisma.ItemOrdemProducaoWhereInput = { status: "CONCLUIDA" };
  if (from || to) where.fimReal = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  if (fluxoId) where.ordemProducao = { fluxoVersao: { fluxo: { id: fluxoId } } };

  const etapas = await prisma.itemOrdemProducao.findMany({
    where,
    select: {
      nome: true, centroTrabalho: true, sequencia: true, fimReal: true,
      qtdPerda: true, vagoes: true, vagonetas: true,
      ordemProducao: {
        select: {
          id: true, numero: true,
          fluxoVersao: { select: { fluxo: { select: { id: true, nome: true } } } },
          produtoItens: {
            select: {
              itemId: true, quantidadeReal: true, unidadeId: true, qtdPerda: true,
              item: { select: { codigo: true, descricao: true, itemUnidades: { select: { unidadeId: true, isPrincipal: true, fatorConversao: true } } } },
            },
          },
        },
      },
    },
    orderBy: { fimReal: "asc" },
  });

  type ProdutoAgg = { itemId: string; codigo: string; descricao: string; pecas: number; perda: number; ops: number };
  type AreaAgg = { area: string; sequencia: number; pecas: number; perda: number; vagoes: number; vagonetas: number; ops: number; produtos: Map<string, ProdutoAgg> };
  const areas = new Map<string, AreaAgg>();

  for (const et of etapas) {
    const chave = et.centroTrabalho ?? et.nome;
    let a = areas.get(chave);
    if (!a) { a = { area: chave, sequencia: et.sequencia, pecas: 0, perda: 0, vagoes: 0, vagonetas: 0, ops: 0, produtos: new Map() }; areas.set(chave, a); }
    a.sequencia = Math.min(a.sequencia, et.sequencia);
    a.ops += 1;
    a.vagoes += et.vagoes ?? 0;
    a.vagonetas += et.vagonetas ?? 0;

    for (const pi of et.ordemProducao.produtoItens) {
      // Real na unidade da linha → peças (fator do ItemUnidade; principal = 1).
      const iu = pi.unidadeId ? pi.item.itemUnidades.find((u) => u.unidadeId === pi.unidadeId) : null;
      const fator = iu && !iu.isPrincipal && iu.fatorConversao != null && Number(iu.fatorConversao) > 0 ? Number(iu.fatorConversao) : 1;
      const pecas = (Number(pi.quantidadeReal) || 0) * fator;
      const perda = Number(pi.qtdPerda) || 0;
      if (pecas <= 0 && perda <= 0) continue;
      a.pecas += pecas;
      a.perda += perda;
      let p = a.produtos.get(pi.itemId);
      if (!p) { p = { itemId: pi.itemId, codigo: pi.item.codigo, descricao: pi.item.descricao, pecas: 0, perda: 0, ops: 0 }; a.produtos.set(pi.itemId, p); }
      p.pecas += pecas;
      p.perda += perda;
      p.ops += 1;
    }
  }

  const round = (v: number) => Math.round(v * 1000) / 1000;
  const data = Array.from(areas.values())
    .sort((x, y) => x.sequencia - y.sequencia)
    .map((a) => ({
      area: a.area, sequencia: a.sequencia, ops: a.ops,
      pecas: round(a.pecas), perda: round(a.perda),
      vagoes: a.vagoes || null, vagonetas: a.vagonetas || null,
      produtos: Array.from(a.produtos.values())
        .sort((x, y) => y.pecas - x.pecas)
        .map((p) => ({ ...p, pecas: round(p.pecas), perda: round(p.perda) })),
    }));

  return NextResponse.json({ data });
}
