// Chão de fábrica (PCP): núcleo da tela gerencial do fluxo de processo.
// - getFluxoChao: o fluxo compartilhado publicado (grafo) da fábrica.
// - saldoDoNo: saldos por produto na fase de um nó (estoque/WIP/PA).
// - criarOPParaProduto: cria uma OP (fluxo inteiro) de um produto.
// - gerarOPsDoDia: rotina diária — gera as OPs do dia conforme o planejado.

import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";
import { snapshotEtapas } from "@/lib/pcp/snapshot-etapas";
import type { FlowGraph, FlowNode } from "@/lib/pcp/types";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import type { KindNo, EstadoWIP, Prisma } from "@prisma/client";

// ── Fluxo compartilhado da fábrica ─────────────────────────────────────────────
// "O fluxo" é uma versão PUBLICADA de FluxoProducao. Quando não informado,
// escolhe o fluxo publicado referenciado por mais engenharias (o compartilhado).
export async function getFluxoChao(fluxoId?: string | null): Promise<{
  fluxoId: string; nome: string; versao: number; grafo: FlowGraph;
} | null> {
  const candidatos = await prisma.fluxoProducao.findMany({
    where: { ativo: true, versaoAtivaId: { not: null }, ...(fluxoId ? { id: fluxoId } : {}) },
    select: { id: true, nome: true, versaoAtivaId: true, _count: { select: { engenharias: true } } },
  });
  if (candidatos.length === 0) return null;
  // mais engenharias vinculadas = o fluxo compartilhado
  candidatos.sort((a, b) => b._count.engenharias - a._count.engenharias);
  const escolhido = candidatos[0];
  const versao = await prisma.fluxoProducaoVersao.findUnique({ where: { id: escolhido.versaoAtivaId! } });
  if (!versao) return null;
  return {
    fluxoId: escolhido.id,
    nome: escolhido.nome,
    versao: versao.versao,
    grafo: (versao.grafo as unknown as FlowGraph) ?? { nodes: [], edges: [] },
  };
}

// ── Saldo por nó (todos os produtos naquela fase) ──────────────────────────────
export type SaldoLinha = { itemId: string; codigo: string | null; descricao: string; quantidade: number; unidade: string | null };

export async function saldoDoNo(no: FlowNode): Promise<{ total: number; itens: SaldoLinha[] }> {
  const d = no.data;
  const localEstoqueId = (d.localEstoqueId as string | null) ?? null;
  // Sem local configurado não há saldo a mostrar.
  if (!localEstoqueId) return { total: 0, itens: [] };

  const estadoWip = no.type === "BUFFER_WIP" ? ((d.estadoWip as EstadoWIP | null) ?? null) : null;

  const rows = await prisma.estoqueItem.findMany({
    where: {
      localEstoqueId,
      clienteDonoId: null,
      ...(estadoWip ? { estadoWip } : {}),
    },
    include: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } } },
    orderBy: { item: { descricao: "asc" } },
  });

  const itens: SaldoLinha[] = rows.map((r) => ({
    itemId: r.itemId,
    codigo: r.item.codigo ?? null,
    descricao: r.item.descricao,
    quantidade: Number(r.quantidadeAtual),
    unidade: r.item.unidadeMedida ?? null,
  }));
  const total = itens.reduce((s, i) => s + i.quantidade, 0);
  return { total, itens };
}

// ── Criação de OP (fluxo inteiro) de um produto ────────────────────────────────
// Usa a engenharia do produto para achar o fluxo compartilhado e snapshota as
// etapas da versão publicada (mesma lógica do POST /api/pcp/ordens).
export async function criarOPParaProduto(opts: {
  itemId: string;
  quantidadePlanejada: number;
  unidade?: string | null;
  observacao?: string | null;
  criadoPor?: string | null;
}): Promise<{ ok: true; id: string; numero: string } | { ok: false; motivo: string }> {
  const { itemId, quantidadePlanejada } = opts;
  if (!(quantidadePlanejada > 0)) return { ok: false, motivo: "Quantidade deve ser > 0" };

  const eng = await prisma.engenhariaProduto.findUnique({ where: { itemId }, select: { fluxoId: true } });
  if (!eng) return { ok: false, motivo: "Produto sem engenharia/fluxo vinculado" };

  const fluxo = await prisma.fluxoProducao.findUnique({ where: { id: eng.fluxoId } });
  if (!fluxo?.versaoAtivaId) return { ok: false, motivo: "Fluxo do produto sem versão publicada" };

  const versao = await prisma.fluxoProducaoVersao.findUnique({ where: { id: fluxo.versaoAtivaId } });
  if (!versao) return { ok: false, motivo: "Versão publicada não encontrada" };

  const etapas = snapshotEtapas((versao.grafo as unknown as FlowGraph) ?? { nodes: [], edges: [] });
  if (etapas.length === 0) return { ok: false, motivo: "Fluxo publicado sem etapas de produção" };

  const unidade = opts.unidade?.trim() || "milheiro";
  const ordem = await prisma.$transaction(async (tx) => {
    const seq = await tx.sequencia.upsert({
      where: { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "OP" } },
      update: { ultimo: { increment: 1 } },
      create: { prefixo: "OP", ultimo: 1 },
    });
    const numero = generateSimpleDocNumber("OP", seq.ultimo);
    return tx.ordemProducao.create({
      data: {
        numero,
        itemId,
        fluxoVersaoId: versao.id,
        quantidadePlanejada,
        unidade,
        observacao: opts.observacao?.trim() || null,
        criadoPor: opts.criadoPor?.trim() || null,
        etapas: {
          create: etapas.map((e) => ({
            nodeId: e.nodeId,
            sequencia: e.sequencia,
            nome: e.nome,
            kind: e.kind as KindNo,
            centroTrabalho: e.centroTrabalho,
            estadoSaida: (e.estadoSaida as EstadoWIP | null) ?? null,
            tempoCicloHoras: e.tempoCicloHoras as unknown as Prisma.Decimal | null,
            subprodutoItemId: e.subprodutoItemId,
            subprodutoDescricao: e.subprodutoDescricao,
          })),
        },
      },
      select: { id: true, numero: true },
    });
  });
  return { ok: true, id: ordem.id, numero: ordem.numero };
}

// ── Planejado do dia ───────────────────────────────────────────────────────────
function diasUteisNoMes(ano: number, mes0: number): number {
  let n = 0;
  const d = new Date(Date.UTC(ano, mes0, 1));
  while (d.getUTCMonth() === mes0) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

export type AlvoDia = { itemId: string; quantidade: number; origem: "MANUAL" | "MPS" };

// Meta do dia: usa MetaProducaoDiaria; sem ela, rateia o MPS do mês por dias úteis.
export async function planejadoDoDia(diaISO: string): Promise<AlvoDia[]> {
  const dia = new Date(`${diaISO}T00:00:00.000Z`);
  const metas = await prisma.metaProducaoDiaria.findMany({ where: { data: dia } });
  if (metas.length > 0) {
    return metas.map((m) => ({ itemId: m.itemId, quantidade: Number(m.quantidade), origem: "MANUAL" as const }));
  }
  // Fallback: MPS do mês rateado por dias úteis.
  const periodo = diaISO.slice(0, 7); // AAAA-MM
  const planos = await prisma.planoMestre.findMany({ where: { periodo } });
  if (planos.length === 0) return [];
  const [ano, mes] = periodo.split("-").map(Number);
  const du = Math.max(1, diasUteisNoMes(ano, mes - 1));
  return planos.map((p) => ({ itemId: p.itemId, quantidade: Math.round((Number(p.quantidade) / du) * 1000) / 1000, origem: "MPS" as const }));
}

// ── Rotina diária: gera as OPs do dia ──────────────────────────────────────────
export async function gerarOPsDoDia(diaISO: string): Promise<{
  criadas: { itemId: string; numero: string }[];
  puladas: { itemId: string; motivo: string }[];
}> {
  const dia = new Date(`${diaISO}T00:00:00.000Z`);
  const amanha = new Date(dia); amanha.setUTCDate(amanha.getUTCDate() + 1);
  const alvos = await planejadoDoDia(diaISO);

  const criadas: { itemId: string; numero: string }[] = [];
  const puladas: { itemId: string; motivo: string }[] = [];

  for (const a of alvos) {
    if (!(a.quantidade > 0)) { puladas.push({ itemId: a.itemId, motivo: "Quantidade zero" }); continue; }
    // Idempotência: não duplica OP do mesmo produto criada hoje.
    const jaTem = await prisma.ordemProducao.findFirst({
      where: { itemId: a.itemId, createdAt: { gte: dia, lt: amanha } },
      select: { id: true },
    });
    if (jaTem) { puladas.push({ itemId: a.itemId, motivo: "Já tem OP hoje" }); continue; }

    const r = await criarOPParaProduto({ itemId: a.itemId, quantidadePlanejada: a.quantidade, observacao: `Rotina diária ${diaISO}`, criadoPor: "rotina" });
    if (r.ok) criadas.push({ itemId: a.itemId, numero: r.numero });
    else puladas.push({ itemId: a.itemId, motivo: r.motivo });
  }
  return { criadas, puladas };
}
