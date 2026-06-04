export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { Criticidade } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchAtivosTree, type TreeNode } from "@/lib/pcm-ativos";

// Nó da árvore já com a config local (criticidade + regime). null = não definido.
export interface AtivoNode {
  codApl: number;
  tag: string;
  descricao: string;
  taggru: string;
  isLeaf: boolean;
  criticidade: Criticidade | null;
  regimeHorasDia: number | null;
  children: AtivoNode[];
}

export interface AtivosResumo {
  A: number;
  B: number;
  C: number;
  naoClassificado: number;
  total: number;
}

export interface AtivosResponse {
  tree: AtivoNode[];
  resumo: AtivosResumo;
  source: "db";
}

/** Injeta a config local (criticidade + regime, por codApl) em cada nó da árvore. */
function montarArvore(
  nodes: TreeNode[],
  critMap: Map<number, Criticidade>,
  regimeMap: Map<number, number>,
): AtivoNode[] {
  return nodes.map((n) => ({
    codApl: n.codApl,
    tag: n.tag,
    descricao: n.descricao,
    taggru: n.taggru,
    isLeaf: n.isLeaf,
    criticidade: critMap.get(n.codApl) ?? null,
    regimeHorasDia: regimeMap.get(n.codApl) ?? null,
    children: montarArvore(n.children, critMap, regimeMap),
  }));
}

function contarResumo(nodes: AtivoNode[]): AtivosResumo {
  const resumo: AtivosResumo = { A: 0, B: 0, C: 0, naoClassificado: 0, total: 0 };
  const walk = (ns: AtivoNode[]) => {
    for (const n of ns) {
      resumo.total++;
      if (n.criticidade === "A") resumo.A++;
      else if (n.criticidade === "B") resumo.B++;
      else if (n.criticidade === "C") resumo.C++;
      else resumo.naoClassificado++;
      walk(n.children);
    }
  };
  walk(nodes);
  return resumo;
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function GET() {
  // 1) Árvore vem do Engeman (somente leitura). Indisponível → 503.
  let tree: TreeNode[];
  try {
    tree = await fetchAtivosTree();
  } catch (err) {
    console.error(
      "[PCM /api/pcm/ativos] Engeman inacessível:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "Engeman inacessível" }, { status: 503 });
  }

  // 2) Config local (criticidade + regime) vem do nosso Postgres (mapas por codApl).
  const [classificacoes, regimes] = await Promise.all([
    prisma.ativoCriticidade.findMany({ select: { codApl: true, criticidade: true } }),
    prisma.ativoRegime.findMany({ select: { codApl: true, horasPorDia: true } }),
  ]);
  const critMap = new Map<number, Criticidade>(
    classificacoes.map((c) => [c.codApl, c.criticidade]),
  );
  const regimeMap = new Map<number, number>(
    regimes.map((r) => [r.codApl, r.horasPorDia]),
  );

  const treeComCriticidade = montarArvore(tree, critMap, regimeMap);

  return NextResponse.json({
    tree: treeComCriticidade,
    resumo: contarResumo(treeComCriticidade),
    source: "db",
  } satisfies AtivosResponse);
}
