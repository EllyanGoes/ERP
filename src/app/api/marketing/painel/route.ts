export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// GET /api/marketing/painel?dias=30 — dados consolidados do dashboard do
// módulo (página /marketing). Sem guard, padrão dos GETs do módulo.
//
// Dias civis em America/Sao_Paulo com offset fixo -03:00 (mesma convenção do
// agregador de tracking em src/lib/tracking/agrega.ts).

/** "YYYY-MM-DD" do dia civil SP. */
function diaSP(instante: Date): string {
  return new Date(instante.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const dias = Math.min(365, Math.max(1, parseInt(searchParams.get("dias") || "30") || 30));

  // Janela: os últimos N dias civis SP, incluindo hoje.
  const hoje = diaSP(new Date());
  const listaDias: string[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(new Date(`${hoje}T00:00:00.000Z`).getTime() - i * 24 * 3600_000);
    listaDias.push(d.toISOString().slice(0, 10));
  }
  const inicio = new Date(`${listaDias[0]}T00:00:00.000-03:00`);
  // MetricaNoDiaria.data é @db.Date (meia-noite UTC do dia civil).
  const inicioData = new Date(`${listaDias[0]}T00:00:00.000Z`);

  const [leadsPeriodo, etapas, gruposEtapa, abertos, ganhos, perdidos, receitaAgg, visitas] =
    await Promise.all([
      // Leads criados no período (alimenta a série diária e o top campanhas).
      prisma.lead.findMany({
        where: { ativo: true, createdAt: { gte: inicio } },
        select: { createdAt: true, campanha: { select: { nome: true } } },
      }),
      prisma.etapaLead.findMany({
        where: { ativo: true },
        orderBy: { ordem: "asc" },
        select: { id: true, nome: true, cor: true },
      }),
      // Snapshot vivo do pipeline (todas as etapas, sem recorte de período).
      prisma.lead.groupBy({
        by: ["etapaId"],
        where: { ativo: true, status: "ABERTO" },
        _count: { _all: true },
      }),
      prisma.lead.count({ where: { ativo: true, status: "ABERTO" } }),
      prisma.lead.count({ where: { status: "GANHO", convertidoEm: { gte: inicio } } }),
      // PERDIDO não tem timestamp próprio — updatedAt é a melhor aproximação.
      prisma.lead.count({ where: { status: "PERDIDO", updatedAt: { gte: inicio } } }),
      prisma.lead.aggregate({
        where: { status: "GANHO", convertidoEm: { gte: inicio } },
        _sum: { valorEstimado: true },
      }),
      prisma.metricaNoDiaria.groupBy({
        by: ["data"],
        where: { fonte: "TRACKING", data: { gte: inicioData } },
        _sum: { eventos: true },
      }),
    ]);

  // Série de leads novos por dia (buckets zerados para os dias sem lead).
  const leadsPorDia = new Map<string, number>(listaDias.map((d) => [d, 0]));
  const porCampanha = new Map<string, number>();
  for (const l of leadsPeriodo) {
    const d = diaSP(l.createdAt);
    if (leadsPorDia.has(d)) leadsPorDia.set(d, (leadsPorDia.get(d) ?? 0) + 1);
    const campanha = l.campanha?.nome ?? "Sem campanha";
    porCampanha.set(campanha, (porCampanha.get(campanha) ?? 0) + 1);
  }

  const totaisEtapa = new Map<string | null, number>(
    gruposEtapa.map((g) => [g.etapaId, g._count._all]),
  );
  const leadsPorEtapa = etapas.map((e) => ({
    etapa: e.nome,
    cor: e.cor,
    total: totaisEtapa.get(e.id) ?? 0,
  }));
  const semEtapa = totaisEtapa.get(null) ?? 0;
  if (semEtapa > 0) leadsPorEtapa.push({ etapa: "Sem etapa", cor: null, total: semEtapa });

  // Visitas (eventos de tracking agregados) somadas entre funis por dia.
  const visitasMap = new Map<string, number>(listaDias.map((d) => [d, 0]));
  for (const v of visitas) {
    const d = v.data.toISOString().slice(0, 10);
    if (visitasMap.has(d)) visitasMap.set(d, (visitasMap.get(d) ?? 0) + (v._sum.eventos ?? 0));
  }

  const decididos = ganhos + perdidos;

  return NextResponse.json({
    data: {
      leadsNovos: listaDias.map((d) => ({ data: d, total: leadsPorDia.get(d) ?? 0 })),
      leadsPorEtapa,
      leadsPorCampanha: (() => {
        const lista: { campanha: string; total: number }[] = [];
        porCampanha.forEach((total, campanha) => lista.push({ campanha, total }));
        return lista.sort((a, b) => b.total - a.total).slice(0, 8);
      })(),
      conversao: {
        abertos,
        ganhos,
        perdidos,
        taxaGanho: decididos > 0 ? ganhos / decididos : 0,
      },
      receitaConvertida: Number(receitaAgg._sum.valorEstimado ?? 0),
      visitasPorDia: listaDias.map((d) => ({ data: d, total: visitasMap.get(d) ?? 0 })),
    },
  });
}
