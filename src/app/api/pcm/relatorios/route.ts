export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { relatoriosManutencao } from "@/lib/manutencao/indicadores";

// GET /api/pcm/relatorios?de=YYYY-MM-DD&ate=YYYY-MM-DD — custos, Pareto de falhas e
// horas por executante do período (padrão: últimos 90 dias).
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const sp = req.nextUrl.searchParams;
  const ate = sp.get("ate") ? new Date(`${sp.get("ate")}T23:59:59.999`) : new Date();
  const de = sp.get("de") ? new Date(`${sp.get("de")}T00:00:00`) : new Date(ate.getTime() - 90 * 86_400_000);
  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime()) || de > ate) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  return NextResponse.json({ data: await relatoriosManutencao(de, ate) });
}
