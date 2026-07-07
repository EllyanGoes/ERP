export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { importarMetricasAds, type ResultadoImportacao } from "@/lib/ads/importar";
import { intervaloDiaSP } from "@/lib/tracking/agrega";

// GET /api/cron/marketing-importa-ads — importa spend/impressões/cliques das
// plataformas de anúncios (Meta/Google/TikTok) para as campanhas ativas com
// idExterno. Roda D-1 e D-2: as plataformas ajustam números retroativamente
// (atribuição/invalidação de cliques), então reimportar ontem e anteontem
// pega os acertos. Chamado pelo Vercel Cron (vercel.json); exige CRON_SECRET.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const resultados: { dia: string; plataformas: ResultadoImportacao[] }[] = [];
  for (const atras of [1, 2]) {
    const instante = new Date(Date.now() - atras * 24 * 3600_000);
    const plataformas = await importarMetricasAds(instante);
    resultados.push({ dia: intervaloDiaSP(instante).dia, plataformas });
  }

  return NextResponse.json({ ok: true, resultados });
}
