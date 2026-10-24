export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma, type Criticidade } from "@prisma/client";
import { requireModulo } from "@/lib/permissions";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { fetchAtivosTree, type TreeNode } from "@/lib/pcm-ativos";
import { dadosDoAtivo, proximoCodApl, ErroAtivo } from "@/lib/manutencao/ativo";

// Nó da árvore já com a config local (criticidade + regime) e o estado do
// ativo. null = não definido.
export interface AtivoNode {
  id: string;
  codApl: number;
  tag: string;
  descricao: string;
  /** @deprecated = id (compatibilidade). */
  taggru: string;
  tipo: string;
  ativo: boolean;
  status: string; // OPERANDO | PARADO
  localizacao: string | null;
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

type Extra = { status: string; localizacao: string | null };

/** Injeta a config local (criticidade + regime, por codApl) e o estado em cada nó. */
function montarArvore(
  nodes: TreeNode[],
  critMap: Map<number, Criticidade>,
  regimeMap: Map<number, number>,
  extraMap: Map<string, Extra>,
): AtivoNode[] {
  return nodes.map((n) => ({
    id: n.id,
    codApl: n.codApl,
    tag: n.tag,
    descricao: n.descricao,
    taggru: n.taggru,
    tipo: n.tipo,
    ativo: n.ativo,
    status: extraMap.get(n.id)?.status ?? "OPERANDO",
    localizacao: extraMap.get(n.id)?.localizacao ?? null,
    isLeaf: n.isLeaf,
    criticidade: critMap.get(n.codApl) ?? null,
    regimeHorasDia: regimeMap.get(n.codApl) ?? null,
    children: montarArvore(n.children, critMap, regimeMap, extraMap),
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

// ── GET /api/pcm/ativos[?inativos=1] — árvore de ativos da empresa ativa ─────
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const incluirInativos = req.nextUrl.searchParams.get("inativos") === "1";
  const [tree, extras, classificacoes, regimes] = await Promise.all([
    fetchAtivosTree({ incluirInativos }),
    prisma.manutAtivo.findMany({ select: { id: true, status: true, localizacao: true } }),
    prisma.ativoCriticidade.findMany({ select: { codApl: true, criticidade: true } }),
    prisma.ativoRegime.findMany({ select: { codApl: true, horasPorDia: true } }),
  ]);
  const critMap = new Map<number, Criticidade>(classificacoes.map((c) => [c.codApl, c.criticidade]));
  const regimeMap = new Map<number, number>(regimes.map((r) => [r.codApl, r.horasPorDia]));
  const extraMap = new Map<string, Extra>(extras.map((e) => [e.id, { status: e.status, localizacao: e.localizacao }]));

  const arvore = montarArvore(tree, critMap, regimeMap, extraMap);

  return NextResponse.json({
    tree: arvore,
    resumo: contarResumo(arvore),
    source: "db",
  } satisfies AtivosResponse);
}

// ── POST /api/pcm/ativos — cadastra um ativo (codApl gerado no servidor) ──────
// Corpo: { tag, nome, tipo?, paiId?, familiaId?, localizacao?, setorId?,
//   centroCustoId?, imobilizadoId?, fornecedorId?, fabricante?, modelo?,
//   numeroSerie?, numeroPatrimonio?, placa?, anoFabricacao?, dataAquisicao?,
//   garantiaAte?, observacoes? }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  let dados: Prisma.ManutAtivoUncheckedUpdateInput;
  try {
    dados = await dadosDoAtivo(body);
  } catch (e) {
    if (e instanceof ErroAtivo) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  // codApl é unique global: em corrida com outro cadastro, tenta de novo.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const codApl = await proximoCodApl();
    try {
      const ativo = await prisma.manutAtivo.create({
        data: { ...(dados as Prisma.ManutAtivoUncheckedCreateInput), empresaId, codApl },
        select: { id: true, codApl: true, tag: true, nome: true },
      });
      return NextResponse.json({ data: ativo }, { status: 201 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const alvo = String((e.meta as { target?: unknown } | undefined)?.target ?? "");
        if (alvo.includes("codApl")) continue;
        return NextResponse.json({ error: "Já existe um ativo com esta tag." }, { status: 409 });
      }
      throw e;
    }
  }
  return NextResponse.json({ error: "Não foi possível gerar o código do ativo. Tente novamente." }, { status: 409 });
}
