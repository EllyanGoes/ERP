export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { indicadoresConfiabilidade } from "@/lib/manutencao/confiabilidade";

// GET /api/pcm/indicadores?de=YYYY-MM-DD&ate=YYYY-MM-DD&ativoId=&criticidade=A|B|C&horizonteDias=30
// MTBF, MTTR, Disponibilidade e Confiabilidade R(t) por ativo e no total, com
// tendência dos 12 meses (lib/manutencao/confiabilidade.ts). Padrão: últimos 12 meses.
function lerData(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const sp = req.nextUrl.searchParams;

  const hoje = new Date();
  const ate = lerData(sp.get("ate")) ?? hoje;
  const de = lerData(sp.get("de")) ?? new Date(ate.getFullYear(), ate.getMonth() - 11, 1);
  if (de > ate) return NextResponse.json({ error: "Período inválido: início depois do fim" }, { status: 400 });
  if ((ate.getTime() - de.getTime()) / 86_400_000 > 366 * 3) return NextResponse.json({ error: "Período máximo: 3 anos" }, { status: 400 });

  const crit = sp.get("criticidade");
  const horizonte = Number(sp.get("horizonteDias") ?? 30);
  const data = await indicadoresConfiabilidade({
    de, ate,
    ativoId: sp.get("ativoId") || null,
    criticidade: crit === "A" || crit === "B" || crit === "C" ? crit : null,
    horizonteDias: Number.isFinite(horizonte) && horizonte > 0 ? Math.min(3650, Math.round(horizonte)) : 30,
  });
  return NextResponse.json({ data });
}
