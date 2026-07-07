export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  return NextResponse.json({ data: { nos, leadsPorEtapa } });
}
