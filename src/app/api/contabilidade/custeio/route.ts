export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { calcularCusteio } from "@/lib/pcp/custeio-cif";

// "2026-05" → 1º dia do mês (UTC). Sem parâmetro: mês corrente.
export function parseCompetencia(s: string | null | undefined): Date {
  const m = (s ?? "").match(/^(\d{4})-(\d{2})/);
  const now = new Date();
  const y = m ? Number(m[1]) : now.getUTCFullYear();
  const mo = m ? Number(m[2]) - 1 : now.getUTCMonth();
  return new Date(Date.UTC(y, mo, 1));
}
const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export async function GET(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;
  const comp = parseCompetencia(new URL(req.url).searchParams.get("competencia"));
  const data = await calcularCusteio(EMPRESA_PADRAO_ID, comp);
  return NextResponse.json({ data });
}

export async function PUT(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const comp = parseCompetencia(typeof body.competencia === "string" ? body.competencia : null);
  const dados = {
    biomassaDia: num(body.biomassaDia),
    energiaMes: num(body.energiaMes),
    combustivelDia: num(body.combustivelDia),
    folhaMes: num(body.folhaMes),
    diasTrabalhados: Math.trunc(num(body.diasTrabalhados)) || 26,
    observacao: typeof body.observacao === "string" ? body.observacao.trim() || null : null,
  };
  await prismaSemEscopo.parametroCusteio.upsert({
    where: { empresaId_competencia: { empresaId: EMPRESA_PADRAO_ID, competencia: comp } },
    create: { empresaId: EMPRESA_PADRAO_ID, competencia: comp, ...dados },
    update: dados,
  });
  const data = await calcularCusteio(EMPRESA_PADRAO_ID, comp);
  return NextResponse.json({ data });
}
