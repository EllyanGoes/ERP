export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { snapshotEtapas } from "@/lib/pcp/snapshot-etapas";
import type { FlowGraph } from "@/lib/pcp/types";
import { pecasPorPalete, baseFatorConsumo } from "@/lib/pcp/unidades";
import { LOCAL_EMBALAGEM_PRODUCAO_NOME } from "@/lib/pcp/wip-estoque";

// POST /api/pcp/ordens/area/consumo-previsto
// Body: { fluxoId, areaNodeId, produtos: [{ itemId, quantidade, unidadeId }] }
// Calcula o consumo PREVISTO do estoque ao criar a OP, espelhando o motor de
// apontamento (apontamento.ts): converte a qtd p/ a base (fatorConversao do ItemUnidade),
// soma os insumos da BOM da fase (× fatorUnidade × baseFator) e — nas áreas de WIP — o
// PEP do estado anterior. Mostra saldo atual e se é suficiente. Usado pela tabela da Nova OP.

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const slug = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase().slice(0, 24) || "PROD";

type ItemUnidadeLite = { unidadeId: string; isPrincipal: boolean; fatorConversao: unknown };
// Fator de conversão (unidade escolhida → unidade-base) pelo itemUnidades.
function fatorConv(unidadeId: string | null, itemUnidades: ItemUnidadeLite[]): number {
  if (!unidadeId) return 1;
  const iu = itemUnidades.find((u) => u.unidadeId === unidadeId);
  if (iu && !iu.isPrincipal && iu.fatorConversao != null) { const f = num(iu.fatorConversao); if (f > 0) return f; }
  return 1;
}

type LinhaIn = { itemId: string; quantidade: number; unidadeId: string | null };
type Acc = { itemId: string | null; descricao: string; unidade: string | null; consumo: number; gerenciavel: boolean; embalagem: boolean };

export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as { fluxoId?: string; areaNodeId?: string; produtos?: unknown } | null;
  const fluxoId = body?.fluxoId ?? "";
  const areaNodeId = body?.areaNodeId ?? "";
  if (!fluxoId || !areaNodeId) return NextResponse.json({ error: "fluxoId e areaNodeId são obrigatórios" }, { status: 400 });
  const linhas: LinhaIn[] = Array.isArray(body?.produtos)
    ? (body!.produtos as Record<string, unknown>[])
        .map((p) => ({ itemId: typeof p.itemId === "string" ? p.itemId : "", quantidade: num(p.quantidade), unidadeId: typeof p.unidadeId === "string" && p.unidadeId ? p.unidadeId : null }))
        .filter((p) => p.itemId && p.quantidade > 0)
    : [];
  if (!linhas.length) return NextResponse.json({ data: [] });

  const fluxo = await prisma.fluxoProducao.findUnique({ where: { id: fluxoId }, select: { versaoAtivaId: true } });
  if (!fluxo?.versaoAtivaId) return NextResponse.json({ data: [] });
  const versao = await prisma.fluxoProducaoVersao.findUnique({ where: { id: fluxo.versaoAtivaId }, select: { grafo: true } });
  const etapas = snapshotEtapas((versao?.grafo as unknown as FlowGraph) ?? { nodes: [], edges: [] });
  const areaIdx = etapas.findIndex((e) => e.nodeId === areaNodeId);
  if (areaIdx < 0) return NextResponse.json({ data: [] });
  const area = etapas[areaIdx];
  const toEstado = area.estadoSaida ?? null;
  const anteriores = etapas.slice(0, areaIdx).filter((e) => e.estadoSaida);
  const fromEstado = anteriores.length ? anteriores[anteriores.length - 1].estadoSaida : null;
  const firstEstado = etapas.find((e) => e.estadoSaida)?.estadoSaida ?? null;

  // Engenharia (BOM) de cada produto da OP, com unidades p/ converter.
  const itemIds = Array.from(new Set(linhas.map((l) => l.itemId)));
  const itens = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true, codigo: true,
      itemUnidades: { select: { unidadeId: true, isPrincipal: true, fatorConversao: true, unidade: { select: { sigla: true } } } },
      engenhariaProduto: { select: { insumos: { select: {
        insumoItemId: true, quantidade: true, base: true, unidadeId: true, estadoConsumo: true,
        insumoItem: { select: { descricao: true, compoeCusto: true, categoriaEstoque: true, unidade: { select: { sigla: true } }, unidadeMedida: true,
          itemUnidades: { select: { unidadeId: true, isPrincipal: true, fatorConversao: true } } } },
      } } } },
    },
  });
  const byItem = new Map(itens.map((it) => [it.id, it]));

  // Acumula consumo por insumo (materiais) + PEP de entrada (WIP do estado anterior).
  const acc = new Map<string, Acc>();
  const addConsumo = (key: string, base: Omit<Acc, "consumo">, consumo: number) => {
    const cur = acc.get(key);
    if (cur) cur.consumo += consumo;
    else acc.set(key, { ...base, consumo });
  };

  let wipFromTotal = 0; // total de PEP de entrada consumido (qtdBase somado) p/ áreas WIP
  for (const l of linhas) {
    const it = byItem.get(l.itemId);
    if (!it) continue;
    const qtdBase = l.quantidade * fatorConv(l.unidadeId, it.itemUnidades);
    const ppp = pecasPorPalete(it.itemUnidades); // peças/palete do produto (p/ POR_PALETE)
    const insumos = it.engenhariaProduto?.insumos ?? [];
    // Áreas com produto de saída ou sem estado de WIP (ex.: Preparação→Mistura): toda a BOM.
    // Áreas de WIP: só os insumos cuja fase de consumo é o estado de saída.
    const consomeTudo = !toEstado || area.produtoSaidaId === l.itemId;
    for (const ins of insumos) {
      if (!consomeTudo && (ins.estadoConsumo ?? firstEstado) !== toEstado) continue;
      const meta = ins.insumoItem;
      if (!meta) continue;
      const fatorU = fatorConv(ins.unidadeId, meta.itemUnidades);
      const baseFator = baseFatorConsumo(ins.base, ppp);
      const consumo = num(ins.quantidade) * fatorU * baseFator * qtdBase;
      if (consumo <= 0) continue;
      addConsumo(ins.insumoItemId, {
        itemId: ins.insumoItemId, descricao: meta.descricao,
        unidade: meta.unidade?.sigla ?? meta.unidadeMedida ?? null,
        gerenciavel: meta.compoeCusto !== false,
        embalagem: meta.categoriaEstoque === "EMBALAGEM",
      }, consumo);
    }
    if (toEstado && fromEstado) wipFromTotal += qtdBase; // consome o PEP do estado anterior
  }

  // PEP de entrada (WIP do estado anterior) — por produto vendável do fluxo.
  if (toEstado && fromEstado && wipFromTotal > 0) {
    for (const l of linhas) {
      const it = byItem.get(l.itemId);
      if (!it) continue;
      const qtdBase = l.quantidade * fatorConv(l.unidadeId, it.itemUnidades);
      // O PEP/WIP é contado na unidade-PRINCIPAL do produto (peça = UN), não em milheiros:
      // qtdBase já vem em peças (qtd × fator da unidade escolhida).
      const wipSigla = it.itemUnidades.find((u) => u.isPrincipal)?.unidade?.sigla ?? "UN";
      addConsumo(`WIP:${it.codigo}:${fromEstado}`, {
        itemId: `WIP-${slug(it.codigo)}-${fromEstado}`,
        descricao: `PEP ${fromEstado.toLowerCase()} — ${it.codigo}`, unidade: wipSigla, gerenciavel: true, embalagem: false,
      }, qtdBase);
    }
  }

  // Saldo dos itens gerenciáveis (materiais + WIP resolvido por código).
  const linhasOut = Array.from(acc.values());
  const wipCodigos = linhasOut.filter((x) => x.itemId && x.itemId.startsWith("WIP-")).map((x) => x.itemId!) as string[];
  const wipResolvidos = wipCodigos.length
    ? await prisma.item.findMany({ where: { codigo: { in: wipCodigos } }, select: { id: true, codigo: true } })
    : [];
  const wipIdPorCodigo = new Map(wipResolvidos.map((w) => [w.codigo, w.id]));
  // Resolve o id real dos WIP (o que estava em itemId era o código).
  for (const x of linhasOut) if (x.itemId && x.itemId.startsWith("WIP-")) x.itemId = wipIdPorCodigo.get(x.itemId) ?? null;

  // Saldo + LOCAL por item. Materiais/WIP comuns: somam os locais e mostram o local
  // dominante (maior saldo). EMBALAGEM (palete/fita/grampo): só o estoque de embalagem
  // da PRODUÇÃO — o que o almoxarife liberou e a produção consome (espelha o apontamento).
  const localEmb = await prisma.localEstoque.findFirst({ where: { nome: LOCAL_EMBALAGEM_PRODUCAO_NOME }, select: { id: true, nome: true } });
  const gerIds = linhasOut.filter((x) => x.gerenciavel && x.itemId).map((x) => x.itemId!) as string[];
  const estoques = gerIds.length
    ? await prisma.estoqueItem.findMany({ where: { itemId: { in: gerIds }, clienteDonoId: null }, select: { itemId: true, quantidadeAtual: true, localEstoque: { select: { id: true, nome: true } } } })
    : [];
  const porItem = new Map<string, { total: number; locais: Map<string, { nome: string; saldo: number }> }>();
  for (const e of estoques) {
    const cur = porItem.get(e.itemId) ?? { total: 0, locais: new Map() };
    const q = num(e.quantidadeAtual);
    cur.total += q;
    const lid = e.localEstoque?.id ?? "?"; const lc = cur.locais.get(lid) ?? { nome: e.localEstoque?.nome ?? "—", saldo: 0 };
    lc.saldo += q; cur.locais.set(lid, lc);
    porItem.set(e.itemId, cur);
  }
  const saldoPorItem = new Map<string, number>();
  const localPorItem = new Map<string, string>();
  for (const x of linhasOut) {
    if (!x.gerenciavel || !x.itemId) continue;
    const info = porItem.get(x.itemId);
    if (x.embalagem) {
      saldoPorItem.set(x.itemId, info && localEmb ? (info.locais.get(localEmb.id)?.saldo ?? 0) : 0);
      localPorItem.set(x.itemId, localEmb?.nome ?? LOCAL_EMBALAGEM_PRODUCAO_NOME);
    } else {
      saldoPorItem.set(x.itemId, info?.total ?? 0);
      const locais = info ? Array.from(info.locais.values()).filter((l) => l.saldo > 0).sort((a, b) => b.saldo - a.saldo) : [];
      localPorItem.set(x.itemId, locais.length === 0 ? "—" : locais.length === 1 ? locais[0].nome : `${locais[0].nome} +${locais.length - 1}`);
    }
  }

  const data = linhasOut.map((x) => {
    const saldo = x.itemId ? r3(saldoPorItem.get(x.itemId) ?? 0) : 0;
    const consumo = r3(x.consumo);
    return {
      itemId: x.itemId, descricao: x.descricao, unidade: x.unidade,
      consumo, gerenciavel: x.gerenciavel,
      saldo: x.gerenciavel ? saldo : null,
      local: x.gerenciavel && x.itemId ? (localPorItem.get(x.itemId) ?? null) : null,
      suficiente: x.gerenciavel ? saldo + 1e-6 >= consumo : true,
    };
  }).sort((a, b) => Number(b.gerenciavel) - Number(a.gerenciavel) || a.descricao.localeCompare(b.descricao));

  return NextResponse.json({ data });
}
