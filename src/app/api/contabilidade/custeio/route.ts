export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { calcularCusteio, parseCompetencia, DIAS_TRABALHADOS_DEFAULT } from "@/lib/pcp/custeio-cif";

// Aceita número ou string em formato BR ("1.035,36"), US ("1035.36") e simples.
const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v ?? "").trim().replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) s = s.replace(/\./g, "").replace(",", "."); // 1.035,36 → 1035.36
  else if (hasComma) s = s.replace(",", ".");                          // 1035,36 → 1035.36
  else if (hasDot) {
    const parts = s.split(".");
    // dois+ pontos OU grupo final de 3 dígitos = milhar (110.000); senão decimal
    if (parts.length > 2 || parts[parts.length - 1].length === 3) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

export async function GET(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;
  const comp = parseCompetencia(new URL(req.url).searchParams.get("competencia"));
  const data = await calcularCusteio(EMPRESA_PADRAO_ID, comp, { volumeDoMes: true });
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
    folhaMoiMes: num(body.folhaMoiMes),
    depreciacaoMes: num(body.depreciacaoMes),
    diaristasMes: num(body.diaristasMes),
    diasTrabalhados: Math.trunc(num(body.diasTrabalhados)) || DIAS_TRABALHADOS_DEFAULT,
    observacao: typeof body.observacao === "string" ? body.observacao.trim() || null : null,
  };
  await prismaSemEscopo.parametroCusteio.upsert({
    where: { empresaId_competencia: { empresaId: EMPRESA_PADRAO_ID, competencia: comp } },
    create: { empresaId: EMPRESA_PADRAO_ID, competencia: comp, ...dados },
    update: dados,
  });
  const data = await calcularCusteio(EMPRESA_PADRAO_ID, comp, { volumeDoMes: true });
  return NextResponse.json({ data });
}
