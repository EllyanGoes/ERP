export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { agregarDia, purgarEventosAntigos } from "@/lib/tracking/agrega";
import { agregarDiaErp } from "@/lib/tracking/agrega-erp";

// GET /api/cron/marketing-agrega-tracking — agrega o tracking web em
// MetricaNoDiaria (fonte=TRACKING) e as métricas do ERP (fonte=ERP, nós com
// vinculoErp) para os funis ativos. Janela retroativa de 3 dias (D-1..D-3):
// reagregar pega edições recentes de urlPatterns/vínculos dos nós.
// Também purga eventos crus com mais de 90 dias (o agregado permanece).
// Chamado pelo Vercel Cron (vercel.json); exige CRON_SECRET como os demais.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const diasAgregados: { dia: string; funis: number; nosComMetrica: number; eventosDoDia: number }[] = [];
  const diasErp: { dia: string; funis: number; nosComMetrica: number }[] = [];
  for (const atras of [1, 2, 3]) {
    const resumo = await agregarDia(new Date(Date.now() - atras * 24 * 3600_000));
    diasAgregados.push(resumo);
  }
  // Métricas do ERP (Fase 4) — mesma janela retroativa dos 3 dias.
  for (const atras of [1, 2, 3]) {
    const resumoErp = await agregarDiaErp(new Date(Date.now() - atras * 24 * 3600_000));
    diasErp.push(resumoErp);
  }
  const eventosPurgados = await purgarEventosAntigos(90);

  return NextResponse.json({
    ok: true,
    diasAgregados,
    diasErp,
    funis: diasAgregados[0]?.funis ?? 0,
    nosErp: diasErp.reduce((s, d) => s + d.nosComMetrica, 0),
    eventosPurgados,
  });
}
