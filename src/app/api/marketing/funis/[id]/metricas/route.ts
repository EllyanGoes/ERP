export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { matchUrlPattern } from "@/lib/tracking/agrega";

type MetricasNo = {
  visitantes: number;
  leads: number;
  conversoes: number;
  receita: number;
  porFonte: Record<string, { visitantes: number; leads: number; conversoes: number; receita: number }>;
};

// Junta as métricas do funil por nó, das várias fontes:
//   manual   → LancamentoManualMetrica (períodos sobrepostos ao filtro)
//   tracking/erp/ads → MetricaNoDiaria (agregado diário do cron)
//   leads    → contagem viva de Lead por etapa (sem período na v1)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const de = searchParams.get("de");
  const ate = searchParams.get("ate");
  const fontes = (searchParams.get("fontes") || "manual,tracking,erp,ads,leads")
    .split(",")
    .map((f) => f.trim().toLowerCase())
    .filter(Boolean);

  const nos: Record<string, MetricasNo> = {};
  const noDe = (noId: string): MetricasNo => {
    if (!nos[noId]) nos[noId] = { visitantes: 0, leads: 0, conversoes: 0, receita: 0, porFonte: {} };
    return nos[noId];
  };
  const soma = (
    noId: string,
    fonte: string,
    valores: { visitantes?: number; leads?: number; conversoes?: number; receita?: number },
  ) => {
    const no = noDe(noId);
    const pf = (no.porFonte[fonte] ||= { visitantes: 0, leads: 0, conversoes: 0, receita: 0 });
    no.visitantes += valores.visitantes ?? 0;
    no.leads += valores.leads ?? 0;
    no.conversoes += valores.conversoes ?? 0;
    no.receita += valores.receita ?? 0;
    pf.visitantes += valores.visitantes ?? 0;
    pf.leads += valores.leads ?? 0;
    pf.conversoes += valores.conversoes ?? 0;
    pf.receita += valores.receita ?? 0;
  };

  if (fontes.includes("manual")) {
    const lancamentos = await prisma.lancamentoManualMetrica.groupBy({
      by: ["noId"],
      where: {
        funilId: params.id,
        // Período sobreposto: começa antes do fim do filtro E termina depois do início.
        ...(ate ? { dataInicio: { lte: new Date(ate) } } : {}),
        ...(de ? { dataFim: { gte: new Date(de) } } : {}),
      },
      _sum: { visitantes: true, leads: true, conversoes: true, receita: true },
    });
    for (const l of lancamentos) {
      soma(l.noId, "MANUAL", {
        visitantes: l._sum.visitantes ?? 0,
        leads: l._sum.leads ?? 0,
        conversoes: l._sum.conversoes ?? 0,
        receita: Number(l._sum.receita ?? 0),
      });
    }
  }

  const fontesDiarias = [
    fontes.includes("tracking") ? "TRACKING" : null,
    fontes.includes("erp") ? "ERP" : null,
    fontes.includes("ads") ? "ADS" : null,
  ].filter(Boolean) as string[];
  if (fontesDiarias.length) {
    const metricas = await prisma.metricaNoDiaria.groupBy({
      by: ["noId", "fonte"],
      where: {
        funilId: params.id,
        fonte: { in: fontesDiarias },
        ...(de || ate
          ? {
              data: {
                ...(de ? { gte: new Date(de) } : {}),
                ...(ate ? { lte: new Date(ate) } : {}),
              },
            }
          : {}),
      },
      _sum: { visitantes: true, conversoes: true, receita: true },
    });
    for (const m of metricas) {
      soma(m.noId, m.fonte, {
        visitantes: m._sum.visitantes ?? 0,
        conversoes: m._sum.conversoes ?? 0,
        receita: Number(m._sum.receita ?? 0),
      });
    }
  }

  const leadsPorEtapa: Record<string, number> = {};
  if (fontes.includes("leads")) {
    const grupos = await prisma.lead.groupBy({
      by: ["etapaId"],
      where: { funilId: params.id, ativo: true },
      _count: { _all: true },
    });
    for (const g of grupos) {
      if (g.etapaId) leadsPorEtapa[g.etapaId] = g._count._all;
    }
    // Nós ETAPA_OFFLINE vinculados a uma etapa recebem a contagem viva de leads.
    const nosOffline = await prisma.funilNo.findMany({
      where: { funilId: params.id, ativo: true, tipo: "ETAPA_OFFLINE" },
      select: { noId: true, config: true },
    });
    for (const n of nosOffline) {
      const etapaLeadId = (n.config as { etapaLeadId?: string } | null)?.etapaLeadId;
      if (etapaLeadId && leadsPorEtapa[etapaLeadId]) {
        noDe(n.noId).leads += leadsPorEtapa[etapaLeadId];
      }
    }
  }

  // ── Path-analysis (Fase 4) — taxas reais das arestas, on-demand (?path=1) ──
  // Calculado dos eventos crus (não do agregado): para cada aresta cujos dois
  // nós são PAGINA/ACAO com matching configurado, mede quantos visitantes que
  // casaram o source casaram o target DEPOIS (createdAt maior).
  let arestas:
    | Record<
        string,
        { source: string; target: string; visitantesSource: number; visitantesAmbos: number; taxaReal: number }
      >
    | null
    | undefined;
  let avisoPath: string | undefined;

  if (searchParams.get("path") === "1") {
    // Período: default últimos 30 dias; capado em 35 (eventos crus têm
    // retenção de 90d, mas a análise em memória precisa de limite).
    const MAX_DIAS_PATH = 35;
    const fimPath = ate ? new Date(new Date(`${ate.slice(0, 10)}T00:00:00.000-03:00`).getTime() + 24 * 3600_000) : new Date();
    const inicioPath = de
      ? new Date(`${de.slice(0, 10)}T00:00:00.000-03:00`)
      : new Date(fimPath.getTime() - 30 * 24 * 3600_000);

    if (fimPath.getTime() - inicioPath.getTime() > MAX_DIAS_PATH * 24 * 3600_000) {
      arestas = null;
      avisoPath = `Path-analysis limitado a ${MAX_DIAS_PATH} dias — reduza o período do filtro.`;
    } else {
      const funil = await prisma.funil.findUnique({
        where: { id: params.id },
        select: {
          canvas: true,
          nos: {
            where: { ativo: true, tipo: { in: ["PAGINA", "ACAO"] } },
            select: { noId: true, tipo: true, config: true },
          },
        },
      });

      // Nós "casáveis" com eventos: PAGINA com urlPatterns / ACAO com eventoNome.
      const casaveis = new Map<
        string,
        { tipo: string; patterns: string[]; eventoNome: string | null }
      >();
      for (const n of funil?.nos ?? []) {
        const cfg = n.config as { urlPatterns?: string[]; eventoNome?: string } | null;
        if (n.tipo === "PAGINA") {
          const patterns = (cfg?.urlPatterns ?? []).filter(Boolean);
          if (patterns.length) casaveis.set(n.noId, { tipo: n.tipo, patterns, eventoNome: null });
        } else {
          const eventoNome = cfg?.eventoNome?.trim();
          if (eventoNome) casaveis.set(n.noId, { tipo: n.tipo, patterns: [], eventoNome: eventoNome.toLowerCase() });
        }
      }

      const edges = (
        (funil?.canvas as { edges?: { id: string; source: string; target: string }[] } | null)?.edges ?? []
      ).filter((e) => casaveis.has(e.source) && casaveis.has(e.target));

      arestas = {};
      if (edges.length > 0) {
        // Eventos do período uma vez só (TrackingEvento não é escopado;
        // prismaSemEscopo segue o padrão do agrega.ts).
        const eventos = await prismaSemEscopo.trackingEvento.findMany({
          where: { createdAt: { gte: inicioPath, lt: fimPath } },
          select: { visitanteId: true, path: true, nome: true, tipo: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        });

        // Por visitante+nó, guarda o primeiro e o último instante de match:
        // existe source→target em sequência ⟺ min(source) < max(target).
        const listaCasaveis: [string, { tipo: string; patterns: string[]; eventoNome: string | null }][] = [];
        casaveis.forEach((def, noId) => listaCasaveis.push([noId, def]));
        const porVisitante = new Map<string, Map<string, { min: number; max: number }>>();
        for (const e of eventos) {
          for (const [noId, def] of listaCasaveis) {
            const casa =
              def.tipo === "PAGINA"
                ? e.tipo === "pageview" && def.patterns.some((p) => matchUrlPattern(p, e.path))
                : e.tipo === "evento" && (e.nome ?? "").toLowerCase() === def.eventoNome;
            if (!casa) continue;
            let doVisitante = porVisitante.get(e.visitanteId);
            if (!doVisitante) porVisitante.set(e.visitanteId, (doVisitante = new Map()));
            const t = e.createdAt.getTime();
            const atual = doVisitante.get(noId);
            if (!atual) doVisitante.set(noId, { min: t, max: t });
            else {
              if (t < atual.min) atual.min = t;
              if (t > atual.max) atual.max = t;
            }
          }
        }

        for (const edge of edges) {
          let visitantesSource = 0;
          let visitantesAmbos = 0;
          porVisitante.forEach((doVisitante) => {
            const s = doVisitante.get(edge.source);
            if (!s) return;
            visitantesSource++;
            const t = doVisitante.get(edge.target);
            if (t && t.max > s.min) visitantesAmbos++;
          });
          arestas[edge.id] = {
            source: edge.source,
            target: edge.target,
            visitantesSource,
            visitantesAmbos,
            taxaReal: visitantesSource > 0 ? visitantesAmbos / visitantesSource : 0,
          };
        }
      }
    }
  }

  return NextResponse.json({
    data: {
      nos,
      leadsPorEtapa,
      ...(arestas !== undefined ? { arestas, ...(avisoPath ? { avisoPath } : {}) } : {}),
    },
  });
}
